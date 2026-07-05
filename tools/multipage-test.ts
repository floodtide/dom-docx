import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateFile } from "@xarsh/ooxml-validator";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { convertHtmlToDocx } from "../src/converter.js";
import { docxToPdf } from "./docx2pdf.js";
import { wrapHtml } from "../src/html-wrap.js";
import { SUITE_OUTPUT } from "./output-paths.js";

const OUT_DIR = path.join(SUITE_OUTPUT, "multipage-report");

const SECTION_COUNT = 14;

/**
 * A deliberately long "report" — a heading plus many sections, each with a
 * subheading and two dense paragraphs. At the harness body font (14px / 1.4
 * line height ≈ 45 lines per Letter page) this reliably spans several pages.
 * Section markers are unique so we can verify no content is lost across pages.
 */
function multiPageHtml(): string {
  const lorem =
    "This paragraph exists to consume vertical space so the document flows across " +
    "multiple pages. It repeats enough prose to fill several lines of a Letter page " +
    "at the harness default font, ensuring the converter's pagination is exercised " +
    "rather than everything collapsing onto a single page.";
  const sections = Array.from({ length: SECTION_COUNT }, (_, i) => {
    const n = i + 1;
    return `
      <h2>Section ${n}: Operating Review</h2>
      <p><strong>Overview.</strong> ${lorem}</p>
      <p>${lorem} Reference marker: section-${n}-body.</p>`;
  }).join("");
  return `
    <h1>Annual Operating Report</h1>
    <p>This document intentionally spans multiple pages to verify pagination.</p>
    ${sections}
    <p>End of report — final marker: report-complete.</p>`;
}

async function allPagesText(pdfPath: string): Promise<{ text: string; pages: number }> {
  const { readFile } = await import("node:fs/promises");
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

let failures = 0;
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
    failures += 1;
  }
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  const html = multiPageHtml();
  await writeFile(path.join(OUT_DIR, "source.html"), wrapHtml(html), "utf-8");

  console.log("Multi-page report — convert + pagination checks:");

  // 1. Convert without crashing, produce a non-trivial buffer.
  let buf: Buffer;
  try {
    buf = await convertHtmlToDocx(html);
  } catch (err) {
    check("convertHtmlToDocx does not throw", false, String(err));
    process.exitCode = 1;
    return;
  }
  const docxPath = path.join(OUT_DIR, "output.docx");
  await writeFile(docxPath, buf);
  check("convertHtmlToDocx does not throw", true);
  check("produces a non-empty .docx", buf.length > 2000, `${buf.length} bytes`);

  // 2. Valid OOXML schema (Office 2019).
  const validation = await validateFile(docxPath, { officeVersion: "Office2019" });
  check("OOXML schema valid", validation.ok, validation.errors.slice(0, 2).map((e) => e.description).join("; "));

  // 3. Render to PDF and count pages — the pagination signal the pixel harness can't see.
  const pdfPath = path.join(OUT_DIR, "output.pdf");
  await docxToPdf(docxPath, pdfPath);
  const { text, pages } = await allPagesText(pdfPath);
  console.log(`  · rendered ${pages} page(s)`);
  check("produces multiple pages (N >= 2)", pages >= 2, `got ${pages}`);

  // 4. Content is not lost across the page break: first, a middle, and the last
  //    marker must all survive in the full (all-pages) extracted text.
  const norm = text.replace(/\s+/g, " ");
  check("first section present", /section-1-body/.test(norm));
  check("middle section present", new RegExp(`section-${Math.ceil(SECTION_COUNT / 2)}-body`).test(norm));
  check("last section present (beyond page 1)", new RegExp(`section-${SECTION_COUNT}-body`).test(norm));
  check("final marker present (last page)", /report-complete/.test(norm));

  console.log(
    failures === 0
      ? `\nMulti-page checks passed (${pages} pages, all content present).`
      : `\n${failures} check(s) failed.`,
  );
  if (failures > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
