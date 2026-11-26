/**
 * Page-break scope guard — a pending page break lands on exactly ONE block (CI-safe, XML only).
 *
 * `pageBreakBeforeNext` used to travel in the shared visitor context, so a break
 * before a `<div>` put one before every child paragraph, and a break before a list
 * put one before every `<li>` (and its nested items). Each case below must emit a
 * single w:pageBreakBefore, on the paragraph holding the expected marker text.
 *
 * Multi-page rendering is covered by `npm run guard:page-break` (LibreOffice).
 */
import { unzipSync } from "fflate";
import { convertHtmlToDocx } from "../src/converter.js";
import { writeGuardResult } from "./guard-result.js";

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

async function documentXml(html: string): Promise<string> {
  const buffer = await convertHtmlToDocx(html, { onWarning: null });
  const files = unzipSync(new Uint8Array(buffer));
  return new TextDecoder().decode(files["word/document.xml"]!);
}

/** Text of every paragraph that carries w:pageBreakBefore. */
function breakParagraphTexts(xml: string): string[] {
  return [...xml.matchAll(/<w:p>[\s\S]*?<\/w:p>|<w:p [\s\S]*?<\/w:p>/g)]
    .map((m) => m[0])
    .filter((p) => /<w:pageBreakBefore\b/.test(p))
    .map((p) => [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((t) => t[1]).join("").trim());
}

const BREAK = `<p style="break-after:page">Intro</p>`;

const CASES: Array<{ name: string; html: string; marker: string }> = [
  {
    name: "break before a <div> → only its first paragraph",
    html: `${BREAK}<div><p>first</p><p>second</p><p>third</p></div>`,
    marker: "first",
  },
  {
    name: "break-before on the <div> itself → only its first paragraph",
    html: `<p>Intro</p><div style="break-before:page"><p>first</p><p>second</p></div>`,
    marker: "first",
  },
  {
    name: "break before a shaded <div> → only its first paragraph",
    html: `${BREAK}<div style="background:#eee;padding:8px"><p>first</p><p>second</p></div>`,
    marker: "first",
  },
  {
    name: "break before a <ul> → only the first item",
    html: `${BREAK}<ul><li>first</li><li>second</li><li>third</li></ul>`,
    marker: "first",
  },
  {
    name: "break before a list → not on the first item's nested list",
    html: `${BREAK}<ul><li>first<ul><li>nested one</li><li>nested two</li></ul></li><li>second</li></ul>`,
    marker: "first",
  },
  {
    name: "break before a list of <li><p>…</p><p>…</p></li> → only the first paragraph",
    html: `${BREAK}<ol><li><p>first</p><p>continued</p></li><li><p>second</p></li></ol>`,
    marker: "first",
  },
];

async function main(): Promise<void> {
  console.log("Page-break scope:");
  for (const { name, html, marker } of CASES) {
    const texts = breakParagraphTexts(await documentXml(html));
    check(name, texts.length === 1 && texts[0] === marker, `breaks before: ${JSON.stringify(texts)}`);
  }

  const ok = failures === 0;
  await writeGuardResult({
    id: "page-break-scope",
    label: "Page-break scope",
    passed: ok ? checksRun : checksRun - failures,
    total: checksRun,
    ok,
    unit: "single w:pageBreakBefore per break",
    command: "npm run guard:page-break-scope",
  });
  console.log(ok ? `\nPage-break scope guard passed (${checksRun} checks).` : `\n${failures} check(s) failed.`);
  if (!ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
