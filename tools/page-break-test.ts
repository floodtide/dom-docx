/**
 * Structural page-break guard — not part of the single-page visual suite.
 *
 * Verifies explicit page breaks via OOXML markers and multi-page PDF output.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
import { validateFile } from "@xarsh/ooxml-validator";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { chromium } from "playwright";
import { convertHtmlToDocx } from "../src/converter.js";
import { VIEWPORT_HEIGHT_PX, VIEWPORT_WIDTH_PX } from "../src/converter/constants.js";
import { wrapHtml } from "../src/html-wrap.js";
import { docxToPdf } from "./docx2pdf.js";
import { writeGuardResult } from "./guard-result.js";
import { GUARDS_OUTPUT } from "./output-paths.js";

const OUT_DIR = path.join(GUARDS_OUTPUT, "page-break");

/** Short content that would fit one page without explicit breaks. */
const PAGE_BREAK_HTML = `
  <p>Page one opener — marker-alpha.</p>
  <div style="break-after: page"></div>
  <p>Page two opener — marker-beta.</p>
  <p style="break-after: page">End of page two — marker-gamma.</p>
  <h2 style="break-before: page">Section on page three</h2>
  <p>Page three body — marker-delta.</p>
`;

let failures = 0;
let checksRun = 0;

function check(name: string, cond: boolean, detail?: string): void {
  checksRun += 1;
  if (cond) console.log(`  ✓ ${name}`);
  else {
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
    failures += 1;
  }
}

function documentXml(buffer: Buffer): string {
  const files = unzipSync(new Uint8Array(buffer));
  const data = files["word/document.xml"];
  return data ? new TextDecoder().decode(data) : "";
}

async function allPagesText(pdfPath: string): Promise<{ text: string; pages: number }> {
  const data = new Uint8Array(await readFile(pdfPath));
  const doc = await getDocument({ data, useSystemFonts: true }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it) => ("str" in it ? it.str : "")).join(" ") + " ";
  }
  return { text, pages: doc.numPages };
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(path.join(OUT_DIR, "source.html"), PAGE_BREAK_HTML.trim(), "utf-8");

  console.log("Page-break guard — structural checks:");

  const docxBuffer = await convertHtmlToDocx(PAGE_BREAK_HTML);
  const docxPath = path.join(OUT_DIR, "output.docx");
  await writeFile(docxPath, docxBuffer);
  check("convertHtmlToDocx succeeds", docxBuffer.length > 500, `${docxBuffer.length} bytes`);

  const validation = await validateFile(docxPath, { officeVersion: "Office2019" });
  check("OOXML schema valid", validation.ok, validation.errors.slice(0, 2).map((e) => e.description).join("; "));

  const xml = documentXml(docxBuffer);
  const pageBreakBeforeCount = (xml.match(/<w:pageBreakBefore\b/g) ?? []).length;
  check("emits w:pageBreakBefore", pageBreakBeforeCount >= 2, `found ${pageBreakBeforeCount}`);

  const pdfPath = path.join(OUT_DIR, "output.pdf");
  await docxToPdf(docxPath, pdfPath);
  const { text, pages } = await allPagesText(pdfPath);
  console.log(`  · rendered ${pages} page(s)`);
  check("forces multiple pages (N >= 2)", pages >= 2, `got ${pages}`);

  const norm = text.replace(/\s+/g, " ");
  check("marker-alpha present", /marker-alpha/.test(norm));
  check("marker-beta present", /marker-beta/.test(norm));
  check("marker-gamma present", /marker-gamma/.test(norm));
  check("marker-delta present", /marker-delta/.test(norm));

  console.log("\nPage-break guard — computed SPA path (Playwright snapshot + rootSelector):");

  const exportRoot = ".page-body";
  const wrappedHtml = `<div class="${exportRoot.slice(1)}">${PAGE_BREAK_HTML.trim()}</div>`;
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: VIEWPORT_WIDTH_PX, height: VIEWPORT_HEIGHT_PX },
  });
  try {
    await page.setContent(wrapHtml(wrappedHtml), { waitUntil: "networkidle" });
    const fragmentHtml = await page.locator(exportRoot).innerHTML();
    const computedBuf = await convertHtmlToDocx(fragmentHtml, {
      styleSource: "computed",
      page,
      rootSelector: exportRoot,
    });
    const computedXml = documentXml(computedBuf);
    const computedBreaks = (computedXml.match(/<w:pageBreakBefore\b/g) ?? []).length;
    check("computed path emits w:pageBreakBefore", computedBreaks >= 2, `found ${computedBreaks}`);
  } finally {
    await browser.close();
  }

  const ok = failures === 0;
  await writeGuardResult({
    id: "page-break",
    label: "Page breaks",
    passed: ok ? checksRun : checksRun - failures,
    total: checksRun,
    ok,
    unit: "OOXML + multi-page PDF + computed",
    command: "npm run guard:page-break",
  });

  console.log(
    ok
      ? `\nPage-break guard passed (${pages} pages, ${pageBreakBeforeCount} pageBreakBefore).`
      : `\n${failures} check(s) failed.`,
  );
  if (!ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
