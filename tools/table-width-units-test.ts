/**
 * Table width unit guard — cell/col widths in CSS absolute units.
 *
 * `<col style="width:…">`, `<col width="…">`, and `<td width="…">` accept
 * pt/pc/mm/cm/in (not just px and %); values must land in the DOCX grid as
 * correctly converted twips instead of being misread as pixel counts.
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

/** All `<w:gridCol w:w="…">` values for the given table HTML. */
async function gridColWidths(tableHtml: string): Promise<number[]> {
  const buffer = await convertHtmlToDocx(tableHtml, { onWarning: null });
  const files = unzipSync(new Uint8Array(buffer));
  const xml = new TextDecoder().decode(files["word/document.xml"]!);
  return [...xml.matchAll(/<w:gridCol w:w="(\d+)"\s*\/>/g)].map((m) => Number(m[1]));
}

async function main(): Promise<void> {
  console.log("col style widths (absolute units):");
  check(
    "col style width:72pt → 1440 twips",
    (await gridColWidths(
      `<table><colgroup><col style="width:72pt"></colgroup><tr><td>x</td></tr></table>`,
    ))[0] === 1440,
  );
  check(
    "col style width:25.4mm → 1440 twips",
    (await gridColWidths(
      `<table><colgroup><col style="width:25.4mm"></colgroup><tr><td>x</td></tr></table>`,
    ))[0] === 1440,
  );

  console.log("\nlegacy width attributes (absolute units):");
  check(
    'col width="1in" → 1440 twips',
    (await gridColWidths(
      `<table><colgroup><col width="1in"></colgroup><tr><td>x</td></tr></table>`,
    ))[0] === 1440,
  );
  check(
    'td width="2cm" → 1134 twips',
    (await gridColWidths(`<table><tr><td width="2cm">x</td></tr></table>`))[0] === 1134,
  );
  check(
    'td width="10pc" → 2400 twips',
    (await gridColWidths(`<table><tr><td width="10pc">x</td></tr></table>`))[0] === 2400,
  );

  console.log("\nexisting px/% behavior (unchanged):");
  check(
    'td width="100" (unitless = px) → 1500 twips',
    (await gridColWidths(`<table><tr><td width="100">x</td></tr></table>`))[0] === 1500,
  );
  check(
    "col style width:50% of 9360 content width → 4680 twips",
    (await gridColWidths(
      `<table style="width:100%"><colgroup><col style="width:50%"><col></colgroup><tr><td>x</td><td>y</td></tr></table>`,
    ))[0] === 4680,
  );

  // Cell-level `style="width:…px"` with no <colgroup>. Reported against html-to-docx
  // (privateOmega/html-to-docx#266) as being ignored or evenly distributed; the ratio
  // between columns has to survive, not just the absolute values.
  console.log("\ncell style widths, no colgroup:");
  const cellPx = await gridColWidths(
    `<table>
      <tr><th style="width:210px">Header</th><td style="width:390px">Body content</td></tr>
      <tr><th style="width:210px">Second</th><td style="width:390px">More body content</td></tr>
    </table>`,
  );
  check("th style width:210px → 3150 twips", cellPx[0] === 3150, `got ${cellPx[0]}`);
  check("td style width:390px → 5850 twips", cellPx[1] === 5850, `got ${cellPx[1]}`);
  check(
    "210:390 ratio preserved (35/65, not evenly distributed)",
    cellPx.length === 2 && Math.abs(cellPx[0]! / (cellPx[0]! + cellPx[1]!) - 0.35) < 0.005,
    `got ${cellPx.map((c) => c).join("/")}`,
  );

  const ok = failures === 0;
  await writeGuardResult({
    id: "table-width-units",
    label: "Table width units",
    passed: ok ? checksRun : checksRun - failures,
    total: checksRun,
    ok,
    unit: "OOXML gridCol twips",
    command: "npm run guard:table-width-units",
  });
  console.log(ok ? `\nTable width unit guard passed (${checksRun} checks).` : `\n${failures} check(s) failed.`);
  if (!ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
