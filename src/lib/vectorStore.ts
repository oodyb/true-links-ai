// src/lib/vectorStore.ts
import { Chunk } from "./chunker";
import path from "path";
import fs from "fs";

export type { Chunk };

const CHUNKS_PATH = path.join(process.cwd(), "public/data/chunks.json");

// global variable to cache processed chunks in memory
let store: Chunk[] | null = null;

// retrieves chunk data from the local filesystem or memory cache
export function getChunks(): Chunk[] {
  if (store) return store;

  // verify the existence of the data source before attempting to read
  if (!fs.existsSync(CHUNKS_PATH)) {
    throw new Error("chunks.json not found. Run `npm run build:chunks` first.");
  }

  const raw = JSON.parse(fs.readFileSync(CHUNKS_PATH, "utf-8"));

  // validate that the data is an array and contains entries
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("chunks.json is empty or malformed. Rebuild with `npm run build:chunks`.");
  }

  // verify the structure of the first object to ensure schema compatibility
  const first = raw[0];
  if (typeof first.id !== "string" || typeof first.text !== "string") {
    throw new Error("chunks.json schema mismatch, expected Chunk objects with `id` and `text`.");
  }

  store = raw as Chunk[];
  return store;
}

// wipes the cache to force a fresh read from the disk on the next request
export function resetStore(): void {
  store = null;
}