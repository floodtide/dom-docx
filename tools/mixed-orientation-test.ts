/**
 * Mixed orientation guard — per-section portrait/landscape from CSS @page rules.
 *
 * Word-style HTML (`@page WordSection2 { size: … landscape }` plus
 * `div.WordSection2 { page: WordSection2 }`) and inline `style="page:landscape"`
 * must split the body into DOCX sections with per-section w:pgSz, while an
 * explicit `orientation` option still forces a single-orientation document.
 *
 * An optional LibreOffice section (skipped when soffice is unavailable; the
 * structural checks run everywhere) renders a portrait → landscape → portrait
 * document to PDF and asserts the pages actually come out at those sizes with
 * each section's content on its own page — page 1 carrying real content is the
 * render-level regression for the blank-first-page sectPr prefix.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { convertHtmlToDocx, type ConvertOptions } from "../src/converter.js";
import { docxToPdf } from "./docx2pdf.js";
import { writeGuardResult } from "./guard-result.js";
import { GUARDS_OUTPUT } from "./output-paths.js";

const OUT_DIR = path.join(GUARDS_OUTPUT, "mixed-orientation");

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

async function documentXml(html: string, options?: ConvertOptions): Promise<string> {
  const buffer = await convertHtmlToDocx(html, { onWarning: null, ...options });
  const files = unzipSync(new Uint8Array(buffer));
  return new TextDecoder().decode(files["word/document.xml"]!);
}

function pageSizes(xml: string): Array<{ w: number; h: number; orient?: string }> {
  return [...xml.matchAll(/<w:pgSz w:w="(\d+)" w:h="(\d+)"(?: w:orient="(\w+)")?\s*\/>/g)].map(
    (m) => ({ w: Number(m[1]), h: Number(m[2]), orient: m[3] }),
  );
}

const WORD_SECTION_HTML = `
<style>
  @page { size: 8.5in 11in; }
  @page WordSection2 { size: 11in 8.5in; }
  div.WordSection2 { page: WordSection2; }
</style>
<div class="WordSection1"><p>portrait-marker-alpha</p></div>
<div class="WordSection2"><p>landscape-marker-beta</p></div>
`;

/** Three sections so the PDF must page portrait → landscape → portrait. */
const RENDER_HTML = `
<style>
  @page WordSection1 { size: 8.5in 11in; }
  div.WordSection1 { page: WordSection1; }
  @page WordSection2 { size: 11in 8.5in; }
  div.WordSection2 { page: WordSection2; }
  @page WordSection3 { size: 8.5in 11in; }
  div.WordSection3 { page: WordSection3; }
</style>
<div class="WordSection1"><p>render-marker-one</p></div>
<div class="WordSection2"><p>render-marker-two</p></div>
<div class="WordSection3"><p>render-marker-three</p></div>
`;

interface RenderedPage {
  widthIn: number;
  heightIn: number;
  text: string;
}

async function renderedPages(pdfPath: string): Promise<RenderedPage[]> {
  const data = new Uint8Array(await readFile(pdfPath));
  const doc = await getDocument({ data, useSystemFonts: true }).promise;
  const pages: RenderedPage[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const { width, height } = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    pages.push({
      widthIn: width / 72,
      heightIn: height / 72,
      text: content.items.map((it) => ("str" in it ? it.str : "")).join(" "),
    });
  }
  return pages;
}

function isPortraitLetter(page: RenderedPage): boolean {
  return Math.abs(page.widthIn - 8.5) < 0.05 && Math.abs(page.heightIn - 11) < 0.05;
}

function isLandscapeLetter(page: RenderedPage): boolean {
  return Math.abs(page.widthIn - 11) < 0.05 && Math.abs(page.heightIn - 8.5) < 0.05;
}

async function main(): Promise<void> {
  console.log("Word-style @page + class mapping:");
  const xml = await documentXml(WORD_SECTION_HTML);
  const sizes = pageSizes(xml);
  check("two sections emitted", (xml.match(/<w:sectPr/g) ?? []).length === 2, xml.match(/<w:sectPr/g)?.length.toString());
  check(
    "first section portrait Letter (12240×15840)",
    sizes[0]?.w === 12240 && sizes[0]?.h === 15840 && sizes[0]?.orient === "portrait",
    JSON.stringify(sizes[0]),
  );
  check(
    "second section landscape (15840×12240)",
    sizes[1]?.w === 15840 && sizes[1]?.h === 12240 && sizes[1]?.orient === "landscape",
    JSON.stringify(sizes[1]),
  );
  check(
    "both content markers survive the split",
    xml.includes("portrait-marker-alpha") && xml.includes("landscape-marker-beta"),
  );
  check(
    "no blank paragraph + sectPr prefix at body start",
    !/<w:body[^>]*>\s*<w:p>\s*<w:r>\s*(?:<w:t\b[^>]*\/>|<w:t\b[^>]*>\s*<\/w:t>)\s*<\/w:r>\s*<\/w:p>\s*<w:p>\s*<w:pPr>\s*<w:sectPr>/.test(
      xml,
    ),
  );

  console.log("\ninline page name:");
  const inlineXml = await documentXml(
    `<p>upright</p><div style="page:landscape"><p>sideways</p></div>`,
  );
  const inlineSizes = pageSizes(inlineXml);
  check(
    'style="page:landscape" starts a landscape section',
    inlineSizes.length === 2 && inlineSizes[1]?.orient === "landscape",
    JSON.stringify(inlineSizes),
  );

  console.log("\nexplicit config still wins:");
  const forced = pageSizes(await documentXml(WORD_SECTION_HTML, { orientation: "landscape" }));
  check(
    "orientation:'landscape' → one landscape section, CSS ignored",
    forced.length === 1 && forced[0]?.orient === "landscape",
    JSON.stringify(forced),
  );
  const plain = pageSizes(await documentXml(`<p>plain</p>`));
  check(
    "document without page CSS → one portrait section",
    plain.length === 1 && plain[0]?.orient === "portrait",
    JSON.stringify(plain),
  );

  // Optional: LibreOffice renders the sections as real pages in the declared orientations.
  console.log("\nrendered PDF pages (optional, needs LibreOffice):");
  try {
    await mkdir(OUT_DIR, { recursive: true });
    const docxPath = path.join(OUT_DIR, "output.docx");
    const pdfPath = path.join(OUT_DIR, "output.pdf");
    await writeFile(docxPath, await convertHtmlToDocx(RENDER_HTML, { onWarning: null }));
    await docxToPdf(docxPath, pdfPath);
    const rendered = await renderedPages(pdfPath);
    check("three pages rendered", rendered.length === 3, `${rendered.length} pages`);
    check(
      "page orientations portrait → landscape → portrait",
      rendered.length === 3 &&
        isPortraitLetter(rendered[0]!) &&
        isLandscapeLetter(rendered[1]!) &&
        isPortraitLetter(rendered[2]!),
      rendered.map((p) => `${p.widthIn.toFixed(1)}x${p.heightIn.toFixed(1)}in`).join(" · "),
    );
    check(
      "page 1 carries the first section's content (no blank first page)",
      rendered[0]?.text.includes("render-marker-one") ?? false,
      rendered[0]?.text.slice(0, 80),
    );
    check(
      "each section's marker lands on its own page",
      (rendered[1]?.text.includes("render-marker-two") ?? false) &&
        (rendered[2]?.text.includes("render-marker-three") ?? false),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  · skipped render section (${msg.split("\n")[0]})`);
  }

  const ok = failures === 0;
  await writeGuardResult({
    id: "mixed-orientation",
    label: "Mixed orientation",
    passed: ok ? checksRun : checksRun - failures,
    total: checksRun,
    ok,
    unit: "per-section w:pgSz + rendered PDF pages",
    command: "npm run guard:mixed-orientation",
  });
  console.log(ok ? `\nMixed orientation guard passed (${checksRun} checks).` : `\n${failures} check(s) failed.`);
  if (!ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
