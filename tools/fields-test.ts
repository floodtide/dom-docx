/**
 * Allowlisted Word field guard — page chrome fields via data-docx-field markers
 * and {page}/{pages} sugar. Asserts OOXML structure, FldS character styles, and
 * that unknown field names are dropped with a warning (never reach w:instrText).
 *
 * Writes a sample document to `output/guards/fields/output.docx` for manual
 * inspection in Word/LibreOffice (footers are not part of the visual suite).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
import { convertHtmlToDocx } from "../src/converter.js";
import { DOCX_FIELD_ALLOWLIST } from "../src/converter/fields.js";
import { writeGuardResult } from "./guard-result.js";
import { GUARDS_OUTPUT } from "./output-paths.js";

const OUT_DIR = path.join(GUARDS_OUTPUT, "fields");

/** Body + chrome for opening in Word/LO — two pages so PAGE/NUMPAGES update visibly. */
const DEMO_BODY = `
  <h1 style="margin:0 0 8px">Quarterly Summary</h1>
  <p style="margin:0;color:#666">Page chrome fields demo — open the footer in Word or LibreOffice.</p>
  <p style="break-before:page;margin:0">Second page body text.</p>
`;

const DEMO_CHROME = {
  headerHtml: '<p style="text-align:right;font-size:10px;color:#999">Confidential</p>',
  footerHtml:
    '<p style="text-align:center;font-size:11px;color:#666">' +
    'Page <span style="font-weight:bold;color:#111" data-docx-field="page"></span>' +
    ' of <span data-docx-field="pages"></span>' +
    ' · Section <span data-docx-field="section"></span>' +
    ' (<span data-docx-field="section-pages"></span> pp)</p>',
};

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

async function convert(
  html: string,
  options?: Parameters<typeof convertHtmlToDocx>[1],
): Promise<{ files: Record<string, Uint8Array>; warnings: string[]; buf: Buffer }> {
  const warnings: string[] = [];
  const buf = await convertHtmlToDocx(html, {
    onWarning: (msg) => warnings.push(msg),
    ...options,
  });
  return { files: unzipSync(new Uint8Array(buf)), warnings, buf };
}

function part(files: Record<string, Uint8Array>, filePath: string): string {
  const data = files[filePath];
  return data ? new TextDecoder().decode(data) : "";
}

const COMPLEX_FIELD =
  /<w:fldChar w:fldCharType="begin" w:dirty="1"\/>[\s\S]*?<w:instrText[^>]*>[\s\S]*?<\/w:instrText>[\s\S]*?<w:fldChar w:fldCharType="separate"\/>[\s\S]*?<w:t[^>]*>[\s\S]*?<\/w:t>[\s\S]*?<w:fldChar w:fldCharType="end"\/>/;

function instrField(xml: string, instruction: string): boolean {
  const re = new RegExp(`<w:instrText[^>]*>\\s*${instruction}\\s*<\\/w:instrText>`);
  return re.test(xml);
}

async function footerXml(options: Parameters<typeof convertHtmlToDocx>[1]): Promise<string> {
  const { files } = await convert("<p>body</p>", options);
  return part(files, "word/footer1.xml");
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });

  console.log("Sample output (for manual inspection):");
  const demo = await convert(DEMO_BODY, DEMO_CHROME);
  const docxPath = path.join(OUT_DIR, "output.docx");
  await writeFile(docxPath, demo.buf);
  await writeFile(
    path.join(OUT_DIR, "source.html"),
    `<!-- body -->\n${DEMO_BODY.trim()}\n\n<!-- headerHtml -->\n${DEMO_CHROME.headerHtml}\n\n<!-- footerHtml -->\n${DEMO_CHROME.footerHtml}\n`,
    "utf-8",
  );
  console.log(`  → ${docxPath}`);

  console.log("\nAllowlisted data-docx-field markers:");
  for (const [name, instruction] of Object.entries(DOCX_FIELD_ALLOWLIST)) {
    const xml = await footerXml({
      footerHtml: `<p><span data-docx-field="${name}">x</span></p>`,
    });
    check(`${name} → ${instruction} instrText`, instrField(xml, instruction));
    check(`${name} complex 5-run field`, COMPLEX_FIELD.test(xml));
    check(`${name} cached value 1`, /<w:t>1<\/w:t>/.test(xml));
  }

  console.log("\nMarker typography → FldS character style:");
  {
    const { files } = await convert("<p>b</p>", {
      footerHtml: '<p><span style="color:#888;font-weight:bold" data-docx-field="page">x</span></p>',
    });
    const footer = part(files, "word/footer1.xml");
    const styles = part(files, "word/styles.xml");
    check("FldS style id present", /w:styleId="FldS0"/.test(styles));
    check("begin run uses w:rStyle", /<w:rStyle w:val="FldS0"\/>/.test(footer));
    check("bold in FldS rPr", /<w:style w:type="character"[\s\S]*FldS0[\s\S]*<w:b/.test(styles));
  }

  console.log("\n{page}/{pages} sugar matches markers:");
  {
    const markerXml = await footerXml({
      footerHtml: '<p>Page <span data-docx-field="page"></span> of <span data-docx-field="pages"></span></p>',
    });
    const sugarXml = await footerXml({
      footerHtml: "<p>Page {page} of {pages}</p>",
    });
    check("sugar PAGE field", instrField(sugarXml, "PAGE"));
    check("sugar NUMPAGES field", instrField(sugarXml, "NUMPAGES"));
    check(
      "sugar and markers same field count",
      (markerXml.match(/w:fldCharType="begin"/g) ?? []).length ===
        (sugarXml.match(/w:fldCharType="begin"/g) ?? []).length,
    );
  }

  console.log("\npageNumber option (boolean | string):");
  {
    const boolXml = await footerXml({ pageNumber: true });
    check("pageNumber:true → PAGE", instrField(boolXml, "PAGE"));
    check("pageNumber:true no fldSimple", !/<w:fldSimple/.test(boolXml));

    const tplXml = await footerXml({ pageNumber: "{page} / {pages}" });
    check("pageNumber template PAGE + NUMPAGES", instrField(tplXml, "PAGE") && instrField(tplXml, "NUMPAGES"));
  }

  console.log("\nUnknown / denied field:");
  {
    const { files, warnings } = await convert("<p>body</p>", {
      footerHtml: '<p><span data-docx-field="MERGEFIELD">bad</span></p>',
    });
    const xml = part(files, "word/footer1.xml");
    check("no MERGEFIELD in instrText", !/MERGEFIELD/.test(xml));
    check("no w:fldChar for denied name", !/<w:fldChar/.test(xml));
    check("warning emitted", warnings.some((w) => w.includes("unsupported data-docx-field")));
    check("literal 'bad' not emitted as instruction", !/<w:instrText[^>]*>\s*bad\s*<\/w:instrText>/.test(xml));
  }

  console.log("\nBody content field (out of scope):");
  {
    const { files, warnings } = await convert('<p><span data-docx-field="page">1</span></p>', {});
    const doc = part(files, "word/document.xml");
    check("no PAGE field in body", !instrField(doc, "PAGE"));
    check("body warning", warnings.some((w) => w.includes("body content is not supported")));
  }

  const ok = failures === 0;
  await writeGuardResult({
    id: "fields",
    label: "Allowlisted Word fields",
    passed: ok ? checksRun : checksRun - failures,
    total: checksRun,
    ok,
    unit: "field OOXML + warnings",
    command: "npm run guard:fields",
  });
  console.log(ok ? `\nFields guard passed (${checksRun} checks).` : `\n${failures} check(s) failed.`);
  if (!ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
