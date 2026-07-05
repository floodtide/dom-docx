import { readFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

/** Pages to read before a document is considered "sampled enough". */
const MAX_TEXT_PAGES = 12;

/**
 * Extract visible text from a PDF (LibreOffice DOCX export) — ALL pages, so a
 * document that flows past page 1 isn't scored as missing its own content.
 */
export async function extractPdfDisplayText(pdfPath: string): Promise<string> {
  const data = new Uint8Array(await readFile(pdfPath));
  const doc = await getDocument({ data, useSystemFonts: true }).promise;
  const parts: string[] = [];
  const pageCount = Math.min(doc.numPages, MAX_TEXT_PAGES);
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    parts.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
  }
  return parts.join(" ");
}
