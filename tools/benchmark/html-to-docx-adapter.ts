import HTMLtoDOCX from "html-to-docx";
import { BENCHMARK_DOCUMENT_OPTIONS } from "./document-options.js";
import type { BenchmarkLibrary } from "./types.js";

export const LIBRARY_ID = "html-to-docx";
export const LIBRARY_VERSION = "1.8.0";
export const LIBRARY_NPM = "html-to-docx";
export const LIBRARY_DESCRIPTION =
  "Original html-to-docx on npm (~337k weekly downloads). Pure JS, no headless browser.";

/** html-to-docx expects a body fragment, not the validator's wrapped document. */
export async function convertWithHtmlToDocx(htmlFragment: string): Promise<Buffer> {
  const result = await HTMLtoDOCX(htmlFragment, null, BENCHMARK_DOCUMENT_OPTIONS, null);
  return Buffer.isBuffer(result) ? result : Buffer.from(result as ArrayBuffer);
}

export const htmlToDocxLibrary: BenchmarkLibrary = {
  id: LIBRARY_ID,
  npm: LIBRARY_NPM,
  version: LIBRARY_VERSION,
  description: LIBRARY_DESCRIPTION,
  convertHtmlFragment: convertWithHtmlToDocx,
};
