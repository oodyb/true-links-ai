// scripts/buildChunks.ts
import { loadFidicDocument } from "../src/lib/loadPDF";
import { chunkByClause } from "../src/lib/chunker";
import { embed } from "../src/lib/embeddings";
import fs from "fs";
import path from "path";

async function main() {
  // read and extract content from the source pdf
  console.log("Loading FIDIC document...");
  const pages = await loadFidicDocument();
  console.log(`   → ${pages.length} pages extracted`);

  // divide extracted text into meaningful clause based segments
  console.log("Chunking by clause...");
  const chunks = chunkByClause(pages);
  console.log(`   → ${chunks.length} chunks produced`);

  // perform a connectivity check with the embedding model
  console.log("\nTesting embedding model...");
  let testVec: number[];
  try {
    testVec = await embed("test");
    console.log(`   → Model OK. Vector length: ${testVec.length}`);
  } catch (err: any) {
    console.error("   [FATAL] Model failed on test input:");
    console.error(err);
    process.exit(1);
  }

  // process each chunk to generate its vector representation
  console.log("\nGenerating embeddings...");
  let failed = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const percent = Math.round(((i + 1) / chunks.length) * 100);
    // display real time progress in the terminal
    process.stdout.write(
      `\r   → ${percent}% (${i + 1}/${chunks.length}) [${chunk.clause}]...          `
    );

    try {
      // attempt embedding with a simple retry logic for stability
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          chunk.embedding = await embed(chunk.text);
          break;
        } catch (err: any) {
          if (attempt === 3) throw err;
          await new Promise((r) => setTimeout(r, 500 * attempt));
        }
      }
    } catch (err: any) {
      console.error(`\n   [ERROR] chunk ${i} [${chunk.clause}]: ${err?.message}`);
      failed++;
    }
  }

  console.log("\n   → Done.");

  // exclude any chunks that failed the embedding process
  const embeddedChunks = chunks.filter(
    (c) => Array.isArray(c.embedding) && c.embedding.length > 0
  );
  console.log(`   → ${embeddedChunks.length} embedded, ${chunks.length - embeddedChunks.length} dropped`);

  // save the final processed data to the public directory
  const outputPath = path.join(process.cwd(), "public/data/chunks.json");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(embeddedChunks, null, 2));
  console.log(`\n✓ Written to ${outputPath}`);

  if (failed > 0) process.exit(1);
}

// execute script and handle unhandled rejection errors
main().catch((err) => {
  console.error("\n[FATAL]", err);
  process.exit(1);
});