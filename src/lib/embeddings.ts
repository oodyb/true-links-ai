// src/lib/embeddings.ts
import { pipeline } from "@xenova/transformers";

// singleton instance to keep the model in memory across calls
let embedder: any = null;

// tracks the initialization state to prevent redundant model loading
let loadingPromise: Promise<any> | null = null;

// ensures the embedding model is loaded once and shared
async function getEmbedder() {
  if (embedder) return embedder;

  if (!loadingPromise) {
    loadingPromise = pipeline(
      "feature-extraction",
      "Xenova/jina-embeddings-v2-small-en"
    );
  }

  embedder = await loadingPromise;
  return embedder;
}

// converts model output from typed arrays to standard numeric arrays
function toVector(data: Float32Array): number[] {
  return Array.from(data).map(Number);
}

// generates a vector representation for a given string
export async function embed(text: string): Promise<number[]> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("embed() called with empty string");

  const model = await getEmbedder();
  // use mean pooling and normalization for consistent vector comparisons
  const output = await model(trimmed, { pooling: "mean", normalize: true });
  return toVector(output.data as Float32Array);
}