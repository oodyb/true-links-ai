// src/lib/chunker.ts
import type { PdfPage } from "./loadPDF";

export interface Chunk {
  id: string;
  clause: string;
  clauseTitle: string;
  parentClause: string;
  text: string;
  page: number | null;
  embedding?: number[];
  type: "clause" | "general";
}

// overlap characters help maintain context between sequential chunks
const OVERLAP_CHARS = 200;

// max character length for non-clause segments
const GENERAL_CHUNK_SIZE = 1200;

// incrementing counter for unique general chunk identifiers
let genCounter = 0;

// splits document pages into structured chunks based on legal clauses
export function chunkByClause(pages: PdfPage[]): Chunk[] {
  // inject page markers into the string to maintain page references after joining
  const fullText = pages.map((p) => `<<<PAGE:${p.page}>>>\n${p.text}`).join("\n");

  const chunks: Chunk[] = [];
  const seenClauses = new Set<string>();
  const seenFingerprints = new Set<string>();

  // regex to identify standard fidic clause and sub-clause headers
  const clauseRegex = /(?:^|\n)(Sub-Clause|Clause)\s+(\d+(?:\.\d+){0,2})\s*\n?\s*([^\n]{2,80})/gm;
  const matches = [...fullText.matchAll(clauseRegex)];

  let lastIndex = 0;
  let lastClauseText = "";

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const clauseType = match[1];
    const number = match[2];
    const rawTitle = match[3].trim();

    // capture any text existing between the previous and current clause
    const gapText = fullText.slice(lastIndex, match.index);
    if (gapText.trim().length > 100) {
      const page = extractPage(fullText, lastIndex);
      processGeneralText(gapText, chunks, seenFingerprints, `General (p.${page ?? "?"})`, fullText, lastIndex);
    }

    // ignore titles that fail validation such as table of contents entries
    if (!isValidTitle(rawTitle)) {
      lastIndex = match.index! + match[0].length;
      continue;
    }

    const key = `${clauseType}-${number}`;
    if (seenClauses.has(key)) continue;
    seenClauses.add(key);

    const startIndex = match.index! + match[0].length;
    let endIndex = fullText.length;

    // determine where the current clause ends
    if (matches[i + 1]) {
      endIndex = matches[i + 1].index!;
    } else {
      // stop before reaching appendices or index if no more clauses follow
      const tail = fullText.slice(startIndex);
      const appendixMatch = tail.match(/\n\s*(APPENDIX|INDEX|GENERAL CONDITIONS OF DISPUTE)/i);
      if (appendixMatch) endIndex = startIndex + appendixMatch.index!;
    }

    const rawText = fullText.slice(startIndex, endIndex);
    const page = extractPage(fullText, match.index!);

    // include a portion of the previous clause to provide context for the current one
    const overlap = lastClauseText.slice(-OVERLAP_CHARS);
    const fullChunkText = `${clauseType} ${number} – ${rawTitle}\n${overlap ? `…${overlap}\n` : ""}${cleanClause(rawText)}`;

    const fingerprint = fullChunkText.slice(0, 120);
    if (!seenFingerprints.has(fingerprint)) {
      seenFingerprints.add(fingerprint);
      chunks.push({
        id: number,
        clause: number,
        clauseTitle: rawTitle,
        parentClause: number.split(".")[0],
        text: fullChunkText,
        page,
        type: "clause",
      });
    }

    lastClauseText = cleanClause(rawText);
    lastIndex = endIndex;
  }

  // handle any remaining text after the final clause
  if (lastIndex < fullText.length) {
    processGeneralText(
      fullText.slice(lastIndex),
      chunks,
      seenFingerprints,
      "Appendix/Forms",
      fullText,
      lastIndex
    );
  }

  return chunks;
}

// breaks down non-clause text into smaller manageable chunks
function processGeneralText(
  segment: string,
  chunks: Chunk[],
  seenFingerprints: Set<string>,
  label: string,
  fullDoc: string,
  originalIndex: number
) {
  const cleaned = cleanGeneral(segment);
  if (cleaned.length < 50) return;

  for (let i = 0; i < cleaned.length; i += GENERAL_CHUNK_SIZE) {
    const sub = cleaned.slice(i, i + GENERAL_CHUNK_SIZE);
    const fingerprint = sub.slice(0, 120);
    if (seenFingerprints.has(fingerprint)) continue;
    seenFingerprints.add(fingerprint);

    const page = extractPage(fullDoc, originalIndex + i);

    chunks.push({
      id: `gen-${String(++genCounter).padStart(4, "0")}`,
      clause: "General",
      clauseTitle: label,
      parentClause: "",
      text: `[${label}]\n${sub}`,
      page,
      type: "general",
    });
  }
}

// cleans clause text while preserving necessary paragraph breaks
function cleanClause(t: string): string {
  return t
    .replace(/<<<PAGE:\d+>>>/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// removes all formatting from general text to maximize density
function cleanGeneral(t: string): string {
  return t.replace(/<<<PAGE:\d+>>>/g, "").replace(/\s+/g, " ").trim();
}

// locates the most recent page marker before the given text index
function extractPage(fullText: string, index: number): number | null {
  const markers = [...fullText.slice(0, index + 20).matchAll(/<<<PAGE:(\d+)>>>/g)];
  const last = markers.at(-1);
  return last ? parseInt(last[1]) : 1;
}

// filters out invalid titles like page numbers or dots from table of contents
function isValidTitle(title: string): boolean {
  if (title.length < 3) return false;
  if (/\.{4,}/.test(title)) return false;
  if (/^\d[\d\s.]*$/.test(title)) return false;
  return true;
}