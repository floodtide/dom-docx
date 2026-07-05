import { createRequire } from "node:module";
import { BENCHMARK_DOCUMENT_OPTIONS } from "./document-options.js";
import type { BenchmarkLibrary } from "./types.js";

const require = createRequire(import.meta.url);

function readPackageVersion(): string {
  try {
    const pkg = require("@turbodocx/html-to-docx/package.json") as { version: string };
    return pkg.version;
  } catch {
    return "unknown";
  }
}

type TurboHtmlToDocx = (
  htmlString: string,
  headerHTMLstring?: string | null,
  documentOptions?: Record<string, unknown>,
  footerHtmlString?: string | null,
) => Promise<ArrayBuffer | Buffer | Blob>;

function resolveTurboConverter(): TurboHtmlToDocx {
  const mod = require("@turbodocx/html-to-docx") as TurboHtmlToDocx | { default: TurboHtmlToDocx };
  const fn = typeof mod === "function" ? mod : mod.default;
  if (typeof fn !== "function") {
    throw new Error("@turbodocx/html-to-docx export is not a function");
  }
  return fn;
}

export const LIBRARY_ID = "turbodocx";
export const LIBRARY_VERSION = readPackageVersion();
export const LIBRARY_NPM = "@turbodocx/html-to-docx";
export const LIBRARY_DESCRIPTION =
  "Actively maintained fork of html-to-docx (list-style-type, data-start, SVG options).";

/** Same API as html-to-docx — body fragment in, DOCX buffer out. */
export async function convertWithTurboDocx(htmlFragment: string): Promise<Buffer> {
  const HTMLtoDOCX = resolveTurboConverter();
  const result = await HTMLtoDOCX(htmlFragment, null, BENCHMARK_DOCUMENT_OPTIONS, null);
  return Buffer.isBuffer(result) ? result : Buffer.from(result as ArrayBuffer);
}

export const turbodocxLibrary: BenchmarkLibrary = {
  id: LIBRARY_ID,
  npm: LIBRARY_NPM,
  version: LIBRARY_VERSION,
  description: LIBRARY_DESCRIPTION,
  convertHtmlFragment: convertWithTurboDocx,
};
