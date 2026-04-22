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

// strips a clean preview from a chunk's raw text — no markers, no headers, trimmed to length
function extractPreview(text: string, maxWords = 20): string {
  return text
    .replace(/<<<PAGE:\d+>>>/g, "")
    .replace(/\[SUPPLEMENTAL:[^\]]*\]/g, "")
    .replace(/^(FIDIC Clause|Reference|Sub-Clause)[\s\S]*?\n/i, "")
    .trim()
    .split(/\s+/)
    .slice(0, maxWords)
    .join(" ");
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

    // build a source map keyed by SOURCE_N so citations can be resolved deterministically
    const sourceMap = Object.fromEntries(
      topChunks.map((c, i) => [`SOURCE_${i}`, c])
    );

    // format retrieved chunks with explicit source IDs the model must use for citations
    const context = topChunks
      .map((c, i) => {
        const cleanText = c.text
          .replace(/<<<PAGE:\d+>>>/g, "")
          .replace(/\[SUPPLEMENTAL:[^\]]*\]/g, "")
          .trim();
        const header = c.type === "clause"
          ? `FIDIC Clause ${c.clause} — ${c.clauseTitle}`
          : `Reference: ${c.clauseTitle}`;
        return `[SOURCE_${i}] ${header}\nCONTENT: ${cleanText}`;
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
You are TrueLinks AI, an expert in the FIDIC 1999 Red Book. Use ONLY the provided CONTEXT below.

RULES:
- DEPTH: Do not summarize. Explain every procedure, deadline, and consequence in full detail.
- NO INVENTION: Never use knowledge outside the provided CONTEXT. If the answer is not there, say so.
- NO LEAKING: Never expose internal markers like "<<<PAGE>>>", "SOURCE:", or "SOURCE_N" in your answer text.
- NO PAGE LABELS: Never write "page X" or "[Page X]" inside the answer text.

CITATIONS:
- Every sentence in your answer MUST end with one or more inline source tags: [SOURCE_0], [SOURCE_1], etc.
- Only cite SOURCE IDs that actually appear in the CONTEXT above — never invent one.
- A single sentence may cite multiple sources: e.g. "...the engineer must act impartially. [SOURCE_0][SOURCE_2]"
- Every SOURCE_N you cite inline MUST have a matching object in the "citations" array.
- Do NOT include a SOURCE in the citations array unless it is cited inline in the answer.

${historyBlock}CONTEXT:
${context}

QUESTION:
${userQuery}

Return ONLY valid JSON (no markdown fences):
{
  "title": "short title (4-5 words)",
  "answer": "detailed answer where every sentence ends with [SOURCE_N] tags",
  "citations": ["SOURCE_0", "SOURCE_2"]
}

The "citations" array must be a flat list of SOURCE IDs (strings) used in the answer, in order of first appearance.
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

    let parsed: { title: string; answer: string; citations: string[] };
    try {
      // remove markdown json blocks if present to ensure successful parsing
      const cleaned = raw.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.log("[ERROR] json parse failed — using raw output as answer.");
      parsed = { title: "New Chat", answer: raw, citations: [] };
    }

    // resolve all citations directly from the source map — page, preview, and title
    // come entirely from vector store data, never from the model
    const seenIds = new Set<string>();
    const enrichedCitations = (parsed.citations ?? [])
      .filter((id) => {
        if (!sourceMap[id] || seenIds.has(id)) return false;
        seenIds.add(id);
        return true;
      })
      .map((id) => {
        const chunk = sourceMap[id];
        return {
          clause: chunk.clause,
          title: chunk.clauseTitle,
          preview: extractPreview(chunk.text),
          page: chunk.page,
          sourceId: id,
        };
      });

    // replace SOURCE_N tags in the answer with their resolved clause identifiers for the frontend
    const finalAnswer = (parsed.answer ?? "")
      .replace(/<<<PAGE:\d+>>>/g, "")
      .replace(/\[SOURCE_(\d+)\]/g, (_, n) => {
        const chunk = sourceMap[`SOURCE_${n}`];
        if (!chunk) return "";
        const id = chunk.clause;
        // format as [Clause X.X] for numeric sub-clauses, bare [Title] for named references
        return /^\d+(\.\d+)*$/.test(id) ? `[Clause ${id}]` : `[${id}]`;
      })
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