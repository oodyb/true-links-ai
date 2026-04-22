// src/lib/retrieval.ts
import { Chunk } from "./chunker";
import { getChunks } from "./vectorStore";
import natural from "natural";

// balancing factors for hybrid search and heuristic ranking
const WEIGHTS = {
  vector: 0.6,
  keyword: 0.4,
  clauseTypeBump: 0.05,
  clauseNumberBump: 0.2,
  titleMatchBump: 0.15,
  tocPenalty: 0.5,
  minScore: 0.35,
  maxPerParent: 2,
  minSpread: 0.15,
};

// global map to store inverse document frequency values
let cachedIdf: Map<string, number> | null = null;

// calculates idf scores to weigh rare terms more heavily than common ones
function getIdf(): Map<string, number> {
  if (cachedIdf) return cachedIdf;

  const chunks = getChunks();
  const df = new Map<string, number>();
  const N = chunks.length;

  // count how many documents contain each unique stem
  for (const chunk of chunks) {
    const stems = new Set(tokenize(chunk.text).map(t => natural.PorterStemmer.stem(t)));
    for (const stem of stems) {
      df.set(stem, (df.get(stem) ?? 0) + 1);
    }
  }

  // apply idf formula for keyword relevance
  const idf = new Map<string, number>();
  for (const [stem, freq] of df) {
    idf.set(stem, Math.log((N + 1) / (freq + 1)) + 1);
  }

  cachedIdf = idf;
  return idf;
}

// splits text into tokens while preserving specialized legal numbering
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9().,$\-\s]/g, " ")
    .split(/\s+/)
    .map(token => token.replace(/(?<!\d)[.,]|[.,](?!\d)/g, ""))
    .filter(t => t.length > 0);
}

// scales scores to a 0-1 range to ensure fair weighting across different metrics
function minMaxNormalize(scores: number[], minSpread = WEIGHTS.minSpread): number[] {
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min;
  // if scores are too close together, return a neutral baseline
  if (range < minSpread) return scores.map(() => 0.5);
  return scores.map((s) => (s - min) / range);
}

// standard dot product for comparing two (already normalized) embedding vectors (cosine similarity)
function dotProduct(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

// calculates a keyword similarity score between query and chunk
function keywordScore(query: string, chunkText: string, idf: Map<string, number>): number {
  const queryTokens = tokenize(query).filter(t => t.length > 2);
  if (!queryTokens.length) return 0;

  const queryStems = queryTokens.map(t => natural.PorterStemmer.stem(t));
  const textStems = new Set(
    tokenize(chunkText).map(t => natural.PorterStemmer.stem(t))
  );

  let weightedMatches = 0;
  let totalWeight = 0;

  // sum weights of matching stems based on their document frequency
  for (const stem of queryStems) {
    const weight = idf.get(stem) ?? 1;
    totalWeight += weight;
    if (textStems.has(stem)) weightedMatches += weight;
  }

  return totalWeight === 0 ? 0 : weightedMatches / totalWeight;
}

// verifies if a specific clause reference exists in a block of text
function containsClause(text: string, clause: string): boolean {
  const escaped = clause.replace(".", "\\.");
  const regex = new RegExp(`\\b${escaped}\\b`);
  return regex.test(text);
}

// extracts all clause numbers explicitly mentioned in the query — handles both "clause 5" and "14.6"
function extractMentionedClauses(query: string): string[] {
  const lowerQuery = query.toLowerCase();
  const results = new Set<string>();

  // match bare decimals like 14.6, 5.2(a)
  const decimals = lowerQuery.match(/\d+(?:\.\d+)+(?:\([a-z]\))?/g) ?? [];
  decimals.forEach(m => results.add(m));

  // match "clause N" or "sub-clause N" where N may be an integer or decimal
  const explicit = lowerQuery.matchAll(/(?:sub-?clause|clause)\s*([\d]+(?:\.[\d]+)*(?:\([a-z]\))?)/g);
  for (const match of explicit) results.add(match[1]);

  return [...results];
}

// primary entry point for finding the most relevant document chunks
export function retrieve(queryEmbedding: number[], query: string, topK = 5): Chunk[] {
  const chunks = getChunks();
  const idf = getIdf();
  const lowerQuery = query.toLowerCase();

  // identify any explicit clause numbers mentioned in the user query
  const mentionedNumbers = extractMentionedClauses(query);

  // chunks whose clause id was directly referenced get injected regardless of score
  const exactMatches = mentionedNumbers.flatMap(id =>
    chunks.filter(c =>
      c.clause === id ||
      c.id === id ||
      c.clause.startsWith(`${id}.`) // pull sub-clauses e.g. 5.1, 5.2 when "clause 5" is asked
    )
  );
  const exactIds = new Set(exactMatches.map(c => c.id));

  // calculate basic similarity across vector and keyword spaces
  const rawSignals = chunks.map((c) => ({
    chunk: c,
    vRaw: dotProduct(queryEmbedding, c.embedding ?? []),
    kRaw: keywordScore(query, c.text, idf),
  }));

  // normalize scores before fusing to prevent one metric from dominating
  const vNorm = minMaxNormalize(rawSignals.map((s) => s.vRaw));
  const kNorm = minMaxNormalize(rawSignals.map((s) => s.kRaw));

  // combine vector and keyword scores into a single baseline
  const fused = rawSignals.map((_, i) =>
    WEIGHTS.vector * vNorm[i] + WEIGHTS.keyword * kNorm[i]
  );

  // refine scores using legal-specific heuristics
  const adjusted = rawSignals.map(({ chunk: c }, i) => {
    let s = fused[i];

    // reduce the relevance of table of contents pages
    const dotLeaders = c.text.match(/\.\s?\.\s?\./g);
    if ((dotLeaders?.length ?? 0) > 4) s *= (1 - WEIGHTS.tocPenalty);

    // boost chunks that contain clause numbers found in the query
    if (mentionedNumbers.some((num) => containsClause(c.text, num)))
      s += (1 - s) * WEIGHTS.clauseNumberBump;

    // provide extra weight if a mentioned clause is in the chunk title
    if (mentionedNumbers.some((num) => containsClause(c.clauseTitle?.toLowerCase() ?? "", num)))
      s += (1 - s) * WEIGHTS.titleMatchBump;

    // prioritize official clauses over general document text
    if (c.type === "clause") s += (1 - s) * WEIGHTS.clauseTypeBump;

    return { chunk: c, score: s };
  });

  // final normalization to ensure threshold filtering is consistent
  const finalNorm = minMaxNormalize(adjusted.map((a) => a.score));
  const scored = adjusted.map(({ chunk }, i) => ({ chunk, score: finalNorm[i] }));

  // remove low-confidence results and sort by final score
  const filtered = scored
    .filter((r) => r.score >= WEIGHTS.minScore)
    .sort((a, b) => b.score - a.score);

  const results: Chunk[] = [];
  const parentCount = new Map<string, number>();

  // exact clause matches are always included first, consuming slots from the budget
  for (const chunk of exactMatches) {
    if (results.length >= topK) break;
    const parent = chunk.parentClause || chunk.clause;
    const count = parentCount.get(parent) ?? 0;
    parentCount.set(parent, count + 1);
    results.push(chunk);
  }

  // backfill remaining slots with the top vector+keyword results, skipping already added chunks
  for (const { chunk } of filtered) {
    if (results.length >= topK) break;
    if (exactIds.has(chunk.id)) continue;
    const parent = chunk.parentClause || chunk.clause;
    const count = parentCount.get(parent) ?? 0;
    if (count >= WEIGHTS.maxPerParent) continue;
    parentCount.set(parent, count + 1);
    results.push(chunk);
  }

  return results;
}