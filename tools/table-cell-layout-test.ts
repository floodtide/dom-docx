/**
 * Table-cell layout guard — sizing and alignment of content inside cells (CI-safe, XML only).
 *
 * - Images clamp to CSS `max-width` (px and %) and to the containing block — the page,
 *   or a table cell's content box (column width minus the cell's own padding, falling
 *   back to `cellpadding`). Without this a 260px image in a 150px cell overflows it.
 * - `max-width: N%` is a percentage, not N px (bordered-div wrapper tables).
 * - Two tables back-to-back in a cell stay two tables: Word fuses directly adjacent
 *   tables, so an EXACT-height empty paragraph carrying the CSS gap separates them.
 * - CSS `vertical-align` on horizontal cells → w:vAlign; unset → center (browser default).
 *
 * Visual counterparts: image-max-width-constraints, table-cell-adjacent-nested-tables,
 * table-cell-vertical-align (tools/generator.ts).
 */
import { unzipSync } from "fflate";
import { convertHtmlToDocx } from "../src/converter.js";
import { parsedCssFromComputedRecord } from "../src/converter/style-resolver.js";
import { TEST_IMAGE_260x140 } from "./test-image.js";
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

const EMU_PER_PX = 9525;
const TWIPS_PER_PX = 15;

/** Display widths (px) of every image, in document order. */
function imageWidthsPx(xml: string): number[] {
  return [...xml.matchAll(/<wp:extent cx="(\d+)"/g)].map((m) => Math.round(Number(m[1]) / EMU_PER_PX));
}

function gridCols(xml: string): number[] {
  return [...xml.matchAll(/<w:gridCol w:w="(\d+)"\s*\/>/g)].map((m) => Number(m[1]));
}

/** Content of each `<w:tc>` in document order (outermost cells only). */
function cells(xml: string): string[] {
  return [...xml.matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map((m) => m[0]);
}

function img(style: string, width = 260, height = 140): string {
  return `<img src="${TEST_IMAGE_260x140}" width="${width}" height="${height}" style="${style}" alt="chart">`;
}

async function imageChecks(): Promise<void> {
  console.log("Images — max-width and containing block:");
  const pageXml = await documentXml(`
    <p>${img("")}</p>
    <p>${img("max-width:120px;height:auto")}</p>
    <p>${img("max-width:25%;height:auto")}</p>
    <p>${img("", 1000, 500)}</p>`);
  const [natural, px, percent, wide] = imageWidthsPx(pageXml);
  check("no max-width keeps the natural 260px", natural === 260, `${natural}px`);
  check("max-width:120px → 120px", px === 120, `${px}px`);
  check("max-width:25% → 25% of the 624px content width (156px)", percent === 156, `${percent}px`);
  check("1000px image still clamps to the 624px page width", wide === 624, `${wide}px`);

  const cellXml = await documentXml(`
    <table border="1" cellpadding="4" style="border-collapse:collapse;width:100%;table-layout:fixed">
      <colgroup><col style="width:25%"><col style="width:50%"><col style="width:25%"></colgroup>
      <tr>
        <td>${img("max-width:100%;height:auto")}</td>
        <td>Middle column text.</td>
        <td style="padding:24px">${img("max-width:100%;height:auto")}</td>
      </tr>
    </table>`);
  const cols = gridCols(cellXml);
  const [plainCell, paddedCell] = imageWidthsPx(cellXml);
  const plainLimit = Math.floor((cols[0]! - 2 * 4 * TWIPS_PER_PX) / TWIPS_PER_PX);
  const paddedLimit = Math.floor((cols[2]! - 2 * 24 * TWIPS_PER_PX) / TWIPS_PER_PX);
  check(
    "image in a narrow cell fits the cell content box (column − cellpadding)",
    plainCell === plainLimit && plainCell! < 260,
    `${plainCell}px, content box ${plainLimit}px (gridCol ${cols[0]})`,
  );
  check(
    "cell's own CSS padding (24px) wins over cellpadding for the content box",
    paddedCell === paddedLimit && paddedCell! < plainCell!,
    `${paddedCell}px, content box ${paddedLimit}px (gridCol ${cols[2]})`,
  );
  const heights = [...cellXml.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"/g)].map((m) => Number(m[2]) / Number(m[1]));
  check(
    "clamped cell images keep their 260×140 aspect ratio",
    heights.every((r) => Math.abs(r - 140 / 260) < 0.02),
    heights.map((r) => r.toFixed(3)).join(", "),
  );
}

async function maxWidthPercentChecks(): Promise<void> {
  console.log("\nmax-width percentage on block wrappers:");
  const xml = await documentXml(`
    <div style="background:#eef;border:1px solid #333;padding:8px;max-width:50%">Half-width box</div>`);
  const tblW = xml.match(/<w:tblW w:type="dxa" w:w="(\d+)"/)?.[1] ?? xml.match(/<w:tblW w:w="(\d+)" w:type="dxa"/)?.[1];
  check(
    "max-width:50% box is half the 9360-twip content width, not 50px",
    Number(tblW) === 4680,
    tblW ? `tblW ${tblW} twips` : "no dxa w:tblW",
  );
}

async function nestedTableChecks(): Promise<void> {
  console.log("\nAdjacent nested tables in one cell:");
  const nested = (between: string, firstStyle = "", secondStyle = "") => `
    <table border="1" cellpadding="8" style="border-collapse:collapse;width:100%">
      <tr><td>
        <table border="1" style="border-collapse:collapse;width:100%;${firstStyle}"><tr><td>A1</td><td>A2</td></tr></table>
        ${between}
        <table border="1" style="border-collapse:collapse;width:100%;${secondStyle}"><tr><td>B1</td><td>B2</td><td>B3</td></tr></table>
      </td></tr>
    </table>`;

  /** The XML between the first nested table's end and the second's start. */
  const gapBetween = (xml: string): string => {
    const firstEnd = xml.indexOf("</w:tbl>") + "</w:tbl>".length;
    return xml.slice(firstEnd, xml.indexOf("<w:tbl>", firstEnd));
  };

  const marginXml = await documentXml(nested("", "margin-bottom:12px"));
  check(
    "two nested tables stay separate (3 w:tbl total)",
    (marginXml.match(/<w:tbl>/g) ?? []).length === 3,
  );
  const marginGap = gapBetween(marginXml);
  check(
    "separator paragraph carries margin-bottom:12px as an EXACT 180-twip line",
    /<w:p>/.test(marginGap) && /w:line="180"/.test(marginGap) && /w:lineRule="exact"/.test(marginGap),
    marginGap.slice(0, 200) || "tables are adjacent",
  );

  const wrapperXml = await documentXml(
    nested("", "", "margin-top:4px").replace(
      /(<table border="1" style="[^"]*"><tr><td>A1[\s\S]*?<\/table>)/,
      '<div style="padding-bottom:6px">$1</div>',
    ),
  );
  check(
    "gap = max(wrapper padding-bottom 6px, next margin-top 4px) → 90 twips",
    /w:line="90"/.test(gapBetween(wrapperXml)),
    gapBetween(wrapperXml).slice(0, 200) || "tables are adjacent",
  );

  const touchingXml = await documentXml(nested(""));
  check(
    "zero-gap tables still get a minimal 1-twip separator",
    /w:line="1"/.test(gapBetween(touchingXml)),
    gapBetween(touchingXml).slice(0, 200) || "tables are adjacent",
  );

  const textXml = await documentXml(nested("<p>Between</p>"));
  const textGap = gapBetween(textXml);
  check(
    "no extra separator when a paragraph already sits between the tables",
    (textGap.match(/<w:p>/g) ?? []).length === 1 && textGap.includes("Between"),
    `${(textGap.match(/<w:p>/g) ?? []).length} paragraph(s)`,
  );
}

async function verticalAlignChecks(): Promise<void> {
  console.log("\nCell vertical-align:");
  const xml = await documentXml(`
    <table border="1" cellpadding="6" style="border-collapse:collapse;width:100%">
      <tr>
        <td>Line 1<br>Line 2<br>Line 3</td>
        <td style="vertical-align:top">top</td>
        <td style="vertical-align:middle">middle</td>
        <td style="vertical-align:bottom">bottom</td>
      </tr>
      <tr style="vertical-align:bottom"><td>row</td><td>inherits</td><td>bottom</td><td>too</td></tr>
    </table>`);
  const vAlign = cells(xml).map((c) => c.match(/<w:vAlign w:val="(\w+)"/)?.[1]);
  check("cell without vertical-align → center (browser default)", vAlign[0] === "center", String(vAlign[0]));
  check("vertical-align:top → top", vAlign[1] === "top", String(vAlign[1]));
  check("vertical-align:middle → center", vAlign[2] === "center", String(vAlign[2]));
  check("vertical-align:bottom → bottom", vAlign[3] === "bottom", String(vAlign[3]));
  const baselineXml = await documentXml(`
    <table><tr><td style="vertical-align:baseline">a<br>b</td><td style="vertical-align:top">c</td></tr></table>`);
  check(
    "vertical-align:baseline → top",
    cells(baselineXml)[0]?.match(/<w:vAlign w:val="(\w+)"/)?.[1] === "top",
    cells(baselineXml)[0]?.match(/<w:vAlign w:val="(\w+)"/)?.[1],
  );
  check(
    "vertical-align on <tr> applies to its cells",
    vAlign.slice(4).every((v) => v === "bottom"),
    vAlign.slice(4).join(", "),
  );

  const rotatedXml = await documentXml(`
    <table border="1"><tr>
      <th style="writing-mode:vertical-rl;vertical-align:bottom">Rotated</th><td>x</td>
    </tr></table>`);
  check(
    "rotated header keeps vAlign center (vAlign acts on the column axis there)",
    cells(rotatedXml)[0]?.match(/<w:vAlign w:val="(\w+)"/)?.[1] === "center",
    cells(rotatedXml)[0]?.match(/<w:vAlign w:val="(\w+)"/)?.[1],
  );
}

async function computedVerticalAlignChecks(): Promise<void> {
  console.log("\nCell vertical-align — computed path:");
  check(
    "computed verticalAlign lands in ParsedCss",
    parsedCssFromComputedRecord({ verticalAlign: "Bottom" }).verticalAlign === "bottom",
    String(parsedCssFromComputedRecord({ verticalAlign: "Bottom" }).verticalAlign),
  );

  // Optional end-to-end: class + inline vertical-align through styleSource "computed".
  // Skipped when Playwright or its Chromium build is missing (e.g. CI installs the
  // package but not the browser) — the conversion itself is what launches Chromium.
  let xml: string;
  try {
    await import("playwright");
    const html = `
      <style>.top { vertical-align: top }</style>
      <table border="1"><tr>
        <td>a<br>b<br>c</td>
        <td class="top">class top</td>
        <td style="vertical-align:bottom">inline bottom</td>
        <td>default</td>
      </tr></table>`;
    const buffer = await convertHtmlToDocx(html, { styleSource: "computed", onWarning: null });
    xml = new TextDecoder().decode(unzipSync(new Uint8Array(buffer))["word/document.xml"]!);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  · skipped Playwright section (${msg.split("\n")[0]})`);
    return;
  }
  const vAlign = cells(xml).map((c) => c.match(/<w:vAlign w:val="(\w+)"/)?.[1]);
  check(
    "computed: default / class top / inline bottom / default → center, top, bottom, center",
    vAlign.join(",") === "center,top,bottom,center",
    vAlign.join(", "),
  );
}

async function main(): Promise<void> {
  await imageChecks();
  await maxWidthPercentChecks();
  await nestedTableChecks();
  await verticalAlignChecks();
  await computedVerticalAlignChecks();

  const ok = failures === 0;
  await writeGuardResult({
    id: "table-cell-layout",
    label: "Table cell layout",
    passed: ok ? checksRun : checksRun - failures,
    total: checksRun,
    ok,
    unit: "image clamps, nested tables, w:vAlign",
    command: "npm run guard:table-cell-layout",
  });
  console.log(ok ? `\nTable cell layout guard passed (${checksRun} checks).` : `\n${failures} check(s) failed.`);
  if (!ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
