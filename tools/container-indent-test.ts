/**
 * Container-indent guard — left/right offsets of indented containers reach their
 * content, and `<dd>` gets its browser indent (CI-safe; optional Playwright section).
 *
 * A container's margin + padding offsets the boxes of its children, and the offset
 * accumulates through nesting. Each block type carries it its own way:
 * - paragraphs, headings, list items → `w:ind` (list items on top of their level indent)
 * - data tables, shaded/bordered boxes, flex rows → `w:tblInd` + a width narrowed
 *   to the container's content box
 * - blockquotes → indented from the container's content edge, not the page edge
 *
 * `<dd>` is indented 40px by the UA stylesheet (`margin-inline-start: 40px`); a
 * `<dl>` inside a `<dd>` therefore puts its `<dt>` at 40px and its `<dd>` at 80px.
 *
 * Twips: 15 per px — 20px → 300, 40px → 600, 60px → 900, 80px → 1200.
 * Visual counterparts: definition-list-dd-indent, container-indent-nested-blocks
 * (tools/generator.ts).
 */
import { unzipSync } from "fflate";
import { convertHtmlToDocx } from "../src/converter.js";
import type { ConvertOptions } from "../src/converter.js";
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

async function bodyXml(html: string, options: ConvertOptions = {}): Promise<string> {
  const buffer = await convertHtmlToDocx(html, { onWarning: null, ...options });
  const xml = new TextDecoder().decode(unzipSync(new Uint8Array(buffer))["word/document.xml"]!);
  return xml.slice(xml.indexOf("<w:body>"), xml.lastIndexOf("<w:sectPr"));
}

interface ParagraphIndent {
  left: number;
  right: number;
}

/** Indent of each text paragraph, keyed by its text (0 when absent). */
function paragraphIndents(xml: string): Map<string, ParagraphIndent> {
  const indents = new Map<string, ParagraphIndent>();
  for (const [paragraph] of xml.matchAll(/<w:p>[\s\S]*?<\/w:p>|<w:p [\s\S]*?<\/w:p>/g)) {
    const text = [...paragraph.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("").trim();
    if (!text) continue;
    const ind = paragraph.match(/<w:ind [^>]*\/>/)?.[0] ?? "";
    indents.set(text, {
      left: Number(ind.match(/w:left="(-?\d+)"/)?.[1] ?? 0),
      right: Number(ind.match(/w:right="(-?\d+)"/)?.[1] ?? 0),
    });
  }
  return indents;
}

/** Outermost table of `xml`: its dxa width and `w:tblInd` (0 when absent). */
function outerTable(xml: string): { width?: number; widthType?: string; indent: number } {
  const tblPr = xml.match(/<w:tblPr>[\s\S]*?<\/w:tblPr>/)?.[0] ?? "";
  const tblW = tblPr.match(/<w:tblW w:type="(\w+)" w:w="([\d.%]+)"/);
  return {
    widthType: tblW?.[1],
    width: tblW ? parseFloat(tblW[2]!) : undefined,
    indent: Number(tblPr.match(/<w:tblInd w:type="dxa" w:w="(\d+)"/)?.[1] ?? 0),
  };
}

function expectIndent(
  indents: Map<string, ParagraphIndent>,
  label: string,
  text: string,
  side: keyof ParagraphIndent,
  twips: number,
  why: string,
): void {
  const actual = indents.get(text)?.[side];
  check(
    `${label}: ${why} (${side} ${twips})`,
    actual === twips,
    actual === undefined ? "paragraph missing" : `${side} ${actual}`,
  );
}

// ── Definition lists ─────────────────────────────────────────────────────────

const DL_HTML = `
  <dl>
    <dt>Term</dt>
    <dd>Definition</dd>
    <dt>Second term</dt>
    <dd>First definition</dd>
    <dd>Second definition</dd>
    <dd style="margin-left:0">Flush definition</dd>
    <dd style="margin-left:20px">Half definition</dd>
    <dd>
      <dl>
        <dt>Inner term</dt>
        <dd>Nested definition</dd>
      </dl>
    </dd>
  </dl>
  <p>After the list</p>
`;

const DL_EXPECTED: Array<[string, number, string]> = [
  ["Term", 0, "<dt> is not indented"],
  ["Definition", 600, "<dd> gets the UA 40px indent"],
  ["Second term", 0, "later <dt> is not indented"],
  ["First definition", 600, "each <dd> of a term is indented"],
  ["Second definition", 600, "each <dd> of a term is indented"],
  ["Flush definition", 0, "margin-left:0 on <dd> removes the indent"],
  ["Half definition", 300, "margin-left:20px on <dd> replaces the 40px"],
  ["Inner term", 600, "nested <dt> sits at the outer <dd>'s 40px"],
  ["Nested definition", 1200, "nested <dd> accumulates to 80px"],
  ["After the list", 0, "content after the list is not indented"],
];

async function definitionListChecks(label: string, options: ConvertOptions = {}): Promise<void> {
  const indents = paragraphIndents(await bodyXml(DL_HTML, options));
  for (const [text, twips, why] of DL_EXPECTED) expectIndent(indents, label, text, "left", twips, why);
}

// ── Paragraphs in indented containers ───────────────────────────────────────

const PARAGRAPH_HTML = `
  <div style="margin-left:40px"><p>Child paragraph</p>Loose text</div>
  <div style="margin-left:40px"><div style="padding-left:20px"><p>Deep paragraph</p></div></div>
  <div style="margin-left:40px"><h3>Indented heading</h3></div>
  <div style="margin-left:40px;background:#eee"><p>Shaded child</p></div>
  <p>Unindented paragraph</p>
`;

async function paragraphChecks(label: string, options: ConvertOptions = {}): Promise<void> {
  const indents = paragraphIndents(await bodyXml(PARAGRAPH_HTML, options));
  expectIndent(indents, label, "Child paragraph", "left", 600, "<p> inside a margin-left:40px <div>");
  expectIndent(indents, label, "Loose text", "left", 600, "inline text after a block child");
  expectIndent(indents, label, "Deep paragraph", "left", 900, "margin + nested padding accumulate");
  expectIndent(indents, label, "Indented heading", "left", 600, "heading inside an indented <div>");
  expectIndent(indents, label, "Shaded child", "left", 0, "shaded container: its cell carries the offset");
  expectIndent(indents, label, "Unindented paragraph", "left", 0, "siblings after the containers");
}

// ── Other block types in an indented container ──────────────────────────────

const IN_DIV = (inner: string) => `<div style="margin-left:40px">${inner}</div>`;
const NARROWED = 9360 - 600; // printable width minus the 40px container offset

async function blockTypeChecks(): Promise<void> {
  const label = "inline";

  const listIndents = paragraphIndents(
    await bodyXml(`
      <ul><li>Top-level item</li></ul>
      ${IN_DIV(`<ul><li>Bullet in div<ul><li>Nested bullet</li></ul></li></ul><ol><li>Number in div</li></ol>`)}`),
  );
  // A top-level item takes its indent from the numbering level (no w:ind); in an
  // indented container the paragraph states level indent (600 per level) + offset.
  check(
    `${label}: top-level list item uses its numbering indent (no w:ind)`,
    listIndents.get("Top-level item")?.left === 0,
    `left ${listIndents.get("Top-level item")?.left}`,
  );
  expectIndent(listIndents, label, "Bullet in div", "left", 1200, "list item in an indented <div> (level 600 + 600)");
  expectIndent(listIndents, label, "Nested bullet", "left", 1800, "nested list item in the <div> (2 levels + 600)");
  check(
    `${label}: ordered list in the <div> is indented like the bullets`,
    listIndents.get("Number in div")?.left === listIndents.get("Bullet in div")?.left,
    `ol ${listIndents.get("Number in div")?.left}`,
  );

  const topTable = outerTable(await bodyXml(`<table border="1" style="width:100%"><tr><td>x</td></tr></table>`));
  check(
    `${label}: top-level 100% table keeps a pct width and no w:tblInd`,
    topTable.widthType === "pct" && topTable.indent === 0,
    JSON.stringify(topTable),
  );
  const divTable = outerTable(await bodyXml(IN_DIV(`<table border="1" style="width:100%"><tr><td>x</td></tr></table>`)));
  check(
    `${label}: 100% table in an indented <div> → w:tblInd 600 and width ${NARROWED}`,
    divTable.indent === 600 && divTable.widthType === "dxa" && divTable.width === NARROWED,
    JSON.stringify(divTable),
  );
  const halfTable = outerTable(await bodyXml(IN_DIV(`<table border="1" style="width:50%"><tr><td>x</td></tr></table>`)));
  check(
    `${label}: 50% table resolves against the container (${NARROWED / 2})`,
    halfTable.indent === 600 && halfTable.width === NARROWED / 2,
    JSON.stringify(halfTable),
  );

  const quoteIndents = paragraphIndents(
    await bodyXml(`<blockquote>Top quote</blockquote>${IN_DIV(`<blockquote>Quote in div</blockquote>`)}`),
  );
  const topQuote = quoteIndents.get("Top quote")?.left ?? 0;
  check(
    `${label}: blockquote in an indented <div> is 600 further in than a top-level one`,
    (quoteIndents.get("Quote in div")?.left ?? 0) === topQuote + 600,
    `top ${topQuote}, in div ${quoteIndents.get("Quote in div")?.left}`,
  );
  const quotedTable = outerTable(
    await bodyXml(`<blockquote><table border="1" style="width:100%"><tr><td>q</td></tr></table></blockquote>`),
  );
  check(
    `${label}: table inside a blockquote is offset to the quote's content edge`,
    quotedTable.indent === topQuote && quotedTable.width === 9360 - topQuote,
    JSON.stringify(quotedTable),
  );

  const shaded = outerTable(await bodyXml(IN_DIV(`<div style="background:#eee;padding:8px"><p>a</p><p>b</p></div>`)));
  check(
    `${label}: shaded box in an indented <div> → w:tblInd 600, width ${NARROWED}`,
    shaded.indent === 600 && shaded.width === NARROWED,
    JSON.stringify(shaded),
  );
  const boxXml = await bodyXml(
    IN_DIV(`<p style="background:#eee;border:1px solid #999;margin-left:20px">Box text</p>`),
  );
  check(
    `${label}: bordered box text keeps only its own 20px margin inside the cell`,
    outerTable(boxXml).indent === 600 && paragraphIndents(boxXml).get("Box text")?.left === 300,
    `${JSON.stringify(outerTable(boxXml))}, text ${paragraphIndents(boxXml).get("Box text")?.left}`,
  );

  // Inline-only shaded block → one shaded paragraph whose padding is a leading tab.
  const bandXml = await bodyXml(IN_DIV(`<div style="background:#e8eef7;padding:8px">Band text</div>`));
  const bandPara = bandXml.match(/<w:p>(?:(?!<\/w:p>)[\s\S])*Band text[\s\S]*?<\/w:p>/)?.[0] ?? "";
  const bandIndent = Number(bandPara.match(/<w:ind [^>]*w:left="(\d+)"/)?.[1] ?? 0);
  const bandTab = Number(bandPara.match(/<w:tab w:val="left" w:pos="(\d+)"/)?.[1] ?? 0);
  check(
    `${label}: shaded text band in an indented <div> → w:ind left 600, padding tab at 600 + 120`,
    bandIndent === 600 && bandTab === 720,
    `left ${bandIndent}, tab ${bandTab}`,
  );

  const flex = outerTable(await bodyXml(IN_DIV(`<div style="display:flex;gap:8px"><div>L</div><div>R</div></div>`)));
  check(`${label}: flex row in an indented <div> → w:tblInd 600`, flex.indent === 600, JSON.stringify(flex));
  const paddedFlexXml = await bodyXml(
    IN_DIV(`<div style="display:flex;padding:8px;background:#ddd"><div>L</div><div>R</div></div>`),
  );
  const innerTblPrs = [...paddedFlexXml.matchAll(/<w:tblPr>[\s\S]*?<\/w:tblPr>/g)].map((m) => m[0]);
  check(
    `${label}: padded flex → outer wrapper carries the offset, inner table does not`,
    outerTable(paddedFlexXml).indent === 600 &&
      outerTable(paddedFlexXml).width === NARROWED &&
      innerTblPrs.slice(1).every((p) => !p.includes("<w:tblInd")),
    JSON.stringify(outerTable(paddedFlexXml)),
  );
}

// ── Right indent ─────────────────────────────────────────────────────────────

const RIGHT_HTML = `
  <div style="margin-right:40px"><p>Right child</p></div>
  <div style="margin-right:40px"><p style="margin-right:20px">Right both</p></div>
  <p style="margin-right:20px">Right own</p>
`;

async function rightIndentChecks(label: string, options: ConvertOptions = {}): Promise<void> {
  const indents = paragraphIndents(await bodyXml(RIGHT_HTML, options));
  expectIndent(indents, label, "Right child", "right", 600, "child of a margin-right:40px <div>");
  expectIndent(indents, label, "Right both", "right", 900, "container + own margin-right accumulate");
  expectIndent(indents, label, "Right own", "right", 300, "own margin-right alone");
}

async function main(): Promise<void> {
  console.log("Definition lists — inline path:");
  await definitionListChecks("inline");
  console.log("\nParagraphs in indented containers — inline path:");
  await paragraphChecks("inline");
  console.log("\nOther block types in an indented container — inline path:");
  await blockTypeChecks();
  console.log("\nRight indent — inline path:");
  await rightIndentChecks("inline");

  console.log("\nComputed path (optional, needs Playwright):");
  try {
    await import("playwright");
    await definitionListChecks("computed", { styleSource: "computed" });
    await paragraphChecks("computed", { styleSource: "computed" });
    await rightIndentChecks("computed", { styleSource: "computed" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  · skipped Playwright section (${msg.split("\n")[0]})`);
  }

  const ok = failures === 0;
  await writeGuardResult({
    id: "container-indent",
    label: "Container indent",
    passed: ok ? checksRun : checksRun - failures,
    total: checksRun,
    ok,
    unit: "w:ind / w:tblInd offset checks",
    command: "npm run guard:container-indent",
  });
  console.log(ok ? `\nContainer-indent guard passed (${checksRun} checks).` : `\n${failures} check(s) failed.`);
  if (!ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
