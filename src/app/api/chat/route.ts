// src/app/api/chat/route.ts
import { GoogleGenerativeAI } from "@google/generative-ai";
import { embed } from "@/lib/embeddings";
import { getChunks } from "@/lib/vectorStore";
import { retrieve } from "@/lib/retrieval";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// model identifiers for the primary and secondary generation llms
const STD_MODEL = "gemini-2.5-flash";
const LITE_MODEL = "gemini-2.5-flash-lite";

// initialize the document chunk store at the module level for faster cold starts
getChunks();

// helper to prevent requests from hanging indefinitely
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export async function POST(req: Request) {
  const startTime = Date.now();
  console.log("\n--- NEW REQUEST ---");

  // progress indicator for server logs
  const logInterval = setInterval(() => {
    process.stdout.write(`\r[TIMER] ${((Date.now() - startTime) / 1000).toFixed(1)}s...`);
  }, 500);

  const done = () => clearInterval(logInterval);

  try {
    const { messages } = await req.json();

    if (!Array.isArray(messages) || messages.length === 0) {
      done();
      return Response.json({ error: "no messages provided" }, { status: 400 });
    }

    const lastMessage = messages[messages.length - 1];

    // support multiple potential message formats from different clients
    const userQuery: string =
      lastMessage?.text ??
      lastMessage?.content ??
      lastMessage?.parts?.find((p: any) => p.type === "text")?.text;

    if (!userQuery || typeof userQuery !== "string") {
      done();
      return Response.json({ error: "invalid user query" }, { status: 400 });
    }

    console.log(`\n[QUERY] "${userQuery}"`);

    // convert query to vector and find the most relevant fidic clauses
    const queryEmbedding = await embed(userQuery);
    const topChunks = retrieve(queryEmbedding, userQuery);

    if (topChunks.length === 0) {
      done();
      console.log("\n[STATUS] no relevant chunks found.");
      return Response.json({
        text: "i couldn't find relevant clauses in the fidic document for your query.",
        sources: [],
        citations: [],
      });
    }

    // format retrieved chunks into a context block for the model
    const context = topChunks
      .map((c) => {
        const cleanText = c.text
          .replace(/<<<PAGE:\d+>>>/g, "")
          .replace(/\[SUPPLEMENTAL:[^\]]*\]/g, "")
          .trim();
        const header = c.type === "clause"
          ? `FIDIC Clause ${c.clause}`
          : `Reference: ${c.clauseTitle}`;
        return `SOURCE: ${header}\nPAGE: ${c.page}\nCONTENT: ${cleanText}`;
      })
      .join("\n\n---\n\n");

    // limit conversation history to stay within context window limits
    const HISTORY_WINDOW = 6;
    const HISTORY_CHAR_BUDGET = 6000;

    const priorTurns = messages
      .slice(0, -1)
      .filter((m: any) => m.role === "user" || m.role === "assistant")
      .slice(-HISTORY_WINDOW)
      .map((m: any) => {
        const text = m?.text ?? m?.content ?? m?.parts?.find((p: any) => p.type === "text")?.text ?? "";
        return `${m.role === "user" ? "User" : "Assistant"}: ${text}`;
      });

    // remove oldest turns if the history exceeds the character budget
    while (priorTurns.join("\n").length > HISTORY_CHAR_BUDGET && priorTurns.length > 1) {
      priorTurns.shift();
    }

    const historyBlock = priorTurns.length > 0
      ? `CONVERSATION HISTORY (for context only — do not answer old questions again):\n${priorTurns.join("\n")}\n\n`
      : "";

    // system instructions defining constraints and output format
    const prompt = `
You are TrueLinks AI, an expert in the FIDIC 1999 Red Book. Use ONLY the provided CONTEXT.

RULES:
- NO INLINE PAGE LABELS: Do not write "page X" or "[Page X]" inside the answer text.
- DETAIL: Do not summarize. Explain procedures, deadlines, and consequences in depth.
- PRIORITY: Base legal answers on [FIDIC Clause] chunks; use [General/Guidance] for support.
- NO LEAKING: Never repeat internal markers like "<<<PAGE>>>" or "SOURCE:" in your answer.
- USE PROVIDED CONTEXT: Only use the retrieved CONTEXT for answering. If the answer is not in the CONTEXT, say you don't know rather than making assumptions.

CITATIONS:
- Add inline citations: [Clause X.X] for numeric IDs, or [Title] for non-numeric (e.g. [Appendix/Forms]).
- Every citation MUST have a matching object in the JSON "citations" array.
- "clause" field in JSON must exactly match the identifier in your text (e.g., "14.6" or "Appendix/Forms").
- "preview" must be 10–15 words taken verbatim from the CONTENT of that clause. No headers or markers.
- Page numbers belong ONLY in the citations array, never in the answer text.
- Every sentance you output must have its own citation array

${historyBlock}CONTEXT:
${context}

QUESTION:
${userQuery}

Return ONLY valid JSON (no markdown fences):
{
  "title": "short title (4-5 words)",
  "answer": "detailed explanation with inline citations [Clause X.X]",
  "citations": [
    {
      "clause": "14.6",
      "title": "Interim Payment Certificates",
      "preview": "10–15 words verbatim from the clause body",
      "page": 42
    }
  ]
}

STRICT CITATION RULE:
- ANY mention of a clause or sub-clause (e.g., "Sub-Clause 13.2") MUST:
  1. Appear as an inline citation [Clause 13.2]
  2. Have a matching object in the "citations" array
- DO NOT mention a clause or a sub-clause or any output without citing it.
`;

    let result;
    let usedModel = STD_MODEL;

    console.log(`\n[MODEL] trying primary: ${usedModel}`);
    try {
      const model = genAI.getGenerativeModel({
        model: usedModel,
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
      });
      result = await withTimeout(model.generateContent(prompt), 60_000);
      console.log(`\n[STATUS] success with ${usedModel}`);
    } catch (err: any) {
      // automatically switch to fallback model if primary fails or times out
      console.log(`\n[ERROR] ${usedModel} failed: ${err.message}`);
      usedModel = LITE_MODEL;
      console.log(`[FALLBACK] switching to ${usedModel}`);
      const fallback = genAI.getGenerativeModel({
        model: usedModel,
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
      });
      result = await fallback.generateContent(prompt);
      console.log(`[STATUS] success with fallback ${usedModel}`);
    }

    done();
    const raw = result.response.text().trim();
    console.log(`\n[DEBUG] model output:\n${raw}\n`);

    let parsed: { title: string; answer: string; citations: any[] };
    try {
      // remove markdown json blocks if present to ensure successful parsing
      const cleaned = raw.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.log("[ERROR] json parse failed — using raw output as answer.");
      parsed = { title: "New Chat", answer: raw, citations: [] };
    }

    // verify llm citations against retrieved data and fetch missing metadata
    const enrichedCitations = (parsed.citations ?? []).map((cite: any) => {
      const rawClause = cite.clause?.toString() ?? "";
      const normalized = rawClause.toLowerCase().replace(/^(sub-)?clause\s*/i, "").trim();

      const matchingChunk =
        topChunks.find((c) => c.id === normalized) ??
        topChunks.find((c) => c.clause.toLowerCase() === normalized) ??
        topChunks.find((c) => c.text.toLowerCase().includes(normalized));

      return {
        ...cite,
        clause: rawClause.replace(/^(sub-)?clause\s*/i, "").trim() || "Reference",
        page: matchingChunk?.page ?? cite.page ?? null,
        preview: cite.preview ?? "",
      };
    });

    // clean the final text of internal page markers and fix citation formatting
    const finalAnswer = (parsed.answer ?? "")
      .replace(/<<<PAGE:\d+>>>/g, "")
      .replace(
        /\[Clause\s+(General\/Guidance|Appendix\/Forms|Appendix\/General|Pre-Clause\/General)\]/gi,
        "[$1]"
      )
      .trim();

    console.log(`[FINISH] ${((Date.now() - startTime) / 1000).toFixed(2)}s\n`);

    return Response.json({
      text: finalAnswer,
      citations: enrichedCitations,
      sources: topChunks.map((c) => c.clause),
      chatTitle: parsed.title,
      debugModelUsed: usedModel,
    });

  } catch (err: any) {
    done();
    console.error(`\n[FATAL] ${err.message}`);
    return Response.json({ error: err.message }, { status: 500 });
  }
}