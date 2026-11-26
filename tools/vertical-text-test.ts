/**
 * Vertical text guard — CSS writing modes on table cells → OOXML w:textDirection.
 *
 * `writing-mode: vertical-rl` (and `vertical-lr`/`sideways-rl`) rotates cell
 * text 90° clockwise (`tbRl`); `sideways-lr` rotates counter-clockwise (`btLr`).
 * `text-orientation: upright` has no OOXML equivalent and stays horizontal.
 * Vertical cells must also stop content-weighting the column by text length —
 * a rotated header column is one line box wide, not one label wide.
 */
import { unzipSync } from "fflate";
import { convertHtmlToDocx } from "../src/converter.js";
import { parsedCssFromComputedRecord } from "../src/converter/style-resolver.js";
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

function gridCols(xml: string): number[] {
  return [...xml.matchAll(/<w:gridCol w:w="(\d+)"\s*\/>/g)].map((m) => Number(m[1]));
}

const MODES_TABLE_HTML = `
  <table border="1" cellpadding="6" style="border-collapse:collapse">
    <tr>
      <th style="writing-mode:vertical-rl">rotate-cw</th>
      <th style="writing-mode:sideways-lr">rotate-ccw</th>
      <th style="writing-mode:vertical-rl;text-orientation:upright">upright-unsupported</th>
      <th>control</th>
    </tr>
    <tr><td>a</td><td>b</td><td>c</td><td>d</td></tr>
  </table>`;

const VERTICAL_HEADER_HTML = (mode: string) => `
  <table border="1" cellpadding="6" style="border-collapse:collapse">
    <tr><th${mode ? ` style="writing-mode:${mode}"` : ""}>A long vertical header label</th><td>value</td></tr>
  </table>`;

async function main(): Promise<void> {
  console.log("w:textDirection mapping:");
  const xml = await documentXml(MODES_TABLE_HTML);
  const tbRl = (xml.match(/<w:textDirection w:val="tbRl"\s*\/>/g) ?? []).length;
  const btLr = (xml.match(/<w:textDirection w:val="btLr"\s*\/>/g) ?? []).length;
  const total = (xml.match(/<w:textDirection /g) ?? []).length;
  check("vertical-rl → one tbRl cell", tbRl === 1, `${tbRl}`);
  check("sideways-lr → one btLr cell", btLr === 1, `${btLr}`);
  check("upright + control stay horizontal (no extra textDirection)", total === 2, `${total}`);

  console.log("\nrow-level inheritance:");
  const rowXml = await documentXml(`
    <table><tr style="writing-mode:vertical-rl"><th>x</th><th>y</th></tr></table>`);
  check(
    "writing-mode on <tr> rotates both cells",
    (rowXml.match(/<w:textDirection w:val="tbRl"\s*\/>/g) ?? []).length === 2,
  );

  console.log("\ncolumn width:");
  const vertical = gridCols(await documentXml(VERTICAL_HEADER_HTML("vertical-rl")));
  const horizontal = gridCols(await documentXml(VERTICAL_HEADER_HTML("")));
  check(
    "vertical header column is narrower than the horizontal one",
    vertical[0]! < horizontal[0]!,
    `vertical ${vertical[0]} vs horizontal ${horizontal[0]} twips`,
  );
  check(
    "vertical header column is a line box, not a label width (< 1in)",
    vertical[0]! < 1440,
    `${vertical[0]} twips`,
  );

  console.log("\nrow height:");
  const verticalRowXml = await documentXml(VERTICAL_HEADER_HTML("vertical-rl"));
  const trHeightMatch = verticalRowXml.match(/<w:trHeight w:val="(\d+)"[^/]*w:hRule="atLeast"/);
  const trHeight = trHeightMatch ? Number(trHeightMatch[1]) : 0;
  check(
    "vertical header row gets ATLEAST height from label length",
    trHeight >= 800,
    trHeight ? `${trHeight} twips` : "no w:trHeight",
  );

  console.log("\ncolumn centering:");
  const centerXml = await documentXml(VERTICAL_HEADER_HTML("vertical-rl"));
  check(
    "centered vertical header cell gets vAlign center",
    /<w:vAlign w:val="center"\s*\/>/.test(centerXml),
  );

  console.log("\ndeprecated alias mapping:");
  const tbRlAliasXml = await documentXml(`
    <table><tr><th style="writing-mode:tb-rl">alias</th></tr></table>`);
  check(
    "deprecated tb-rl alias → tbRl cell",
    (tbRlAliasXml.match(/<w:textDirection w:val="tbRl"\s*\/>/g) ?? []).length === 1,
  );

  console.log("\nhalf-turn transform (upward headers):");
  const directionFor = async (transform: string): Promise<string | undefined> => {
    const xml = await documentXml(`
      <table><tr><th style="writing-mode:vertical-rl;transform:${transform}">label</th></tr></table>`);
    return xml.match(/<w:textDirection w:val="(\w+)"/)?.[1];
  };
  for (const transform of ["rotate(180deg)", "rotate(-180deg)", "rotate(.5turn)", "rotate(540deg)"]) {
    const dir = await directionFor(transform);
    check(`vertical-rl + ${transform} → btLr`, dir === "btLr", String(dir));
  }
  // What getComputedStyle reports for rotate(180deg): float noise, not exact zeros.
  const computedMatrix = "matrix(-1, 1.22465e-16, -1.22465e-16, -1, 0, 0)";
  const matrixDir = await directionFor(computedMatrix);
  check("vertical-rl + computed matrix(-1, ~0, ~0, -1, 0, 0) → btLr", matrixDir === "btLr", String(matrixDir));
  for (const transform of ["rotate(90deg)", "scale(2)", "none"]) {
    const dir = await directionFor(transform);
    check(`vertical-rl + ${transform} stays tbRl`, dir === "tbRl", String(dir));
  }
  const horizontalXml = await documentXml(`
    <table><tr><th style="transform:rotate(180deg)">flat</th></tr></table>`);
  check(
    "transform alone (no writing-mode) adds no textDirection",
    !/<w:textDirection /.test(horizontalXml),
  );

  console.log("\nmulti-line rotated header height:");
  const rowHeight = async (label: string): Promise<number> => {
    const xml = await documentXml(`
      <table border="1" cellpadding="6" style="border-collapse:collapse">
        <tr><th style="writing-mode:vertical-rl">${label}</th><td>value</td></tr>
      </table>`);
    return Number(xml.match(/<w:trHeight w:val="(\d+)"/)?.[1] ?? 0);
  };
  const joined = await rowHeight("Quarterly revenue growth");
  const stacked = await rowHeight("Quarterly<br>revenue<br>growth");
  const longestLine = await rowHeight("Quarterly");
  check(
    "<br> lines size the row by the longest line, not the joined text",
    stacked > 0 && stacked === longestLine && stacked < joined * 0.6,
    `stacked ${stacked} · longest line ${longestLine} · joined ${joined} twips`,
  );

  console.log("\ncomputed-path mapping:");
  const computed = parsedCssFromComputedRecord({
    writingMode: "vertical-rl",
    textOrientation: "mixed",
  });
  check(
    "computed writingMode / textOrientation land in ParsedCss",
    computed.writingMode === "vertical-rl" && computed.textOrientation === "mixed",
    JSON.stringify({ writingMode: computed.writingMode, textOrientation: computed.textOrientation }),
  );
  const computedTransform = parsedCssFromComputedRecord({
    writingMode: "vertical-rl",
    transform: computedMatrix,
  });
  check(
    "computed transform lands in ParsedCss",
    computedTransform.transform === computedMatrix,
    String(computedTransform.transform),
  );
  check(
    "computed transform 'none' is dropped",
    parsedCssFromComputedRecord({ transform: "none" }).transform === undefined,
  );
  check(
    "computed max-width % stays a percentage",
    parsedCssFromComputedRecord({ maxWidth: "50%" }).maxWidthPercent === 50,
  );

  const ok = failures === 0;
  await writeGuardResult({
    id: "vertical-text",
    label: "Vertical cell text",
    passed: ok ? checksRun : checksRun - failures,
    total: checksRun,
    ok,
    unit: "w:textDirection + narrow columns",
    command: "npm run guard:vertical-text",
  });
  console.log(ok ? `\nVertical text guard passed (${checksRun} checks).` : `\n${failures} check(s) failed.`);
  if (!ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
