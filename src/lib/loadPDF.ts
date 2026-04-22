// src/lib/loadPDF.ts
import fs from "fs";
import path from "path";
import { getDocumentProxy } from "unpdf";

// structure for storing page text and its corresponding page number
export interface PdfPage {
  text: string;
  page: number;
}

// parses the fidic pdf and extracts text content page by page
export async function loadFidicDocument(): Promise<PdfPage[]> {
  const filePath = path.join(process.cwd(), "public/data/cons1_bc.pdf");

  // ensure the file exists to avoid runtime crashes
  if (!fs.existsSync(filePath)) {
    throw new Error(`fidic pdf not found at: ${filePath}`);
  }

  const buffer = new Uint8Array(fs.readFileSync(filePath));
  const pdf = await getDocumentProxy(buffer);
  const pages: PdfPage[] = [];

  // iterate through each page in the document
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();

    let lastY: number | null = null;
    let lastX: number | null = null;
    let pageText = "";

    // process individual text items and reconstruct layout based on coordinates
    for (const item of textContent.items as any[]) {
      const x: number = item.transform[4]; // horizontal coordinate
      const y: number = item.transform[5]; // vertical coordinate

      if (lastY !== null && Math.abs(y - lastY) > 5) {
        // add newline if the vertical position shifts significantly
        pageText += "\n";
      } else if (lastX !== null && x - lastX > 10) {
        // add space if there is a wide horizontal gap between items
        pageText += " ";
      }

      pageText += item.str;
      lastY = y;
      lastX = x + (item.width ?? 0); // track current position including item width
    }

    // reduce excessive whitespace to keep chunks clean
    const cleaned = pageText.replace(/\n{3,}/g, "\n\n").trim();

    // only include pages that contain a meaningful amount of text
    if (cleaned.length > 20) {
      pages.push({ text: cleaned, page: i });
    }
  }

  return pages;
}