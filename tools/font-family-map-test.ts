/**
 * Font-family mapping guard — CSS `font-family` → OOXML `w:rFonts`.
 *
 * Non-visual on purpose: the bug lives in the emitted font name, and the visual
 * harness (LibreOffice on Linux) can't show it — Segoe UI Symbol isn't installed
 * there and fontconfig fallback supplies the glyphs either way.
 *
 * Regression: `"segoe ui"` → Arial also caught `"Segoe UI Symbol"`. Arial has no
 * ballot-box glyphs (U+2610–2612), so in Word on Windows the checkboxes render as
 * unrelated (Arabic-looking) glyphs instead of ☐ ☑ ☒.
 *
 * The converted DOCX is kept at output/guards/font-family-map/output.docx so it can
 * be opened in Word to see the real rendering.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
import { convertHtmlToDocx } from "../src/converter.js";
import { writeGuardResult } from "./guard-result.js";
import { GUARDS_OUTPUT } from "./output-paths.js";

const OUT_DIR = path.join(GUARDS_OUTPUT, "font-family-map");

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

const HTML = `
  <p style="font-family:'Segoe UI Symbol'">☐ Open task ☑ Done task ☒ Cancelled task</p>
  <p style="font-family:'Segoe UI'">Segoe UI control paragraph</p>
  <p style="font-family:Arial">Arial control: ☐ Open ☑ Done ☒ Cancelled</p>
`;

/** `w:rFonts` attributes of every run in the paragraph whose text contains `marker`. */
function runFontsForParagraph(xml: string, marker: string): Array<Record<string, string>> {
  const paragraph = [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)]
    .map((m) => m[0])
    .find((p) => p.includes(marker));
  if (!paragraph) return [];
  return [...paragraph.matchAll(/<w:r>[\s\S]*?<\/w:r>|<w:r [\s\S]*?<\/w:r>/g)].map((run) => {
    const rFonts = run[0].match(/<w:rFonts([^>]*)\/>/)?.[1] ?? "";
    return Object.fromEntries(
      [...rFonts.matchAll(/w:(\w+)="([^"]*)"/g)].map((a) => [a[1]!, a[2]!]),
    );
  });
}

function describe(runs: Array<Record<string, string>>): string {
  return runs.length === 0
    ? "paragraph not found"
    : runs.map((r) => (Object.keys(r).length ? JSON.stringify(r) : "no w:rFonts (document default)")).join("; ");
}

async function main(): Promise<void> {
  const buffer = await convertHtmlToDocx(HTML, { onWarning: null });
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(path.join(OUT_DIR, "output.docx"), buffer);
  const files = unzipSync(new Uint8Array(buffer));
  const xml = new TextDecoder().decode(files["word/document.xml"]!);

  console.log("Segoe UI Symbol keeps its own font:");
  const symbolRuns = runFontsForParagraph(xml, "Open task");
  check(
    "every run has w:ascii=\"Segoe UI Symbol\"",
    symbolRuns.length > 0 && symbolRuns.every((r) => r.ascii === "Segoe UI Symbol"),
    describe(symbolRuns),
  );
  check(
    "every run has w:hAnsi=\"Segoe UI Symbol\" (Word picks U+2610–2612 from hAnsi)",
    symbolRuns.length > 0 && symbolRuns.every((r) => r.hAnsi === "Segoe UI Symbol"),
    describe(symbolRuns),
  );

  console.log("\nexisting mappings unchanged:");
  const segoeRuns = runFontsForParagraph(xml, "Segoe UI control");
  check(
    "plain \"Segoe UI\" still maps to Arial (explicit or document default)",
    segoeRuns.length > 0 && segoeRuns.every((r) => r.ascii === undefined || r.ascii === "Arial"),
    describe(segoeRuns),
  );
  const arialRuns = runFontsForParagraph(xml, "Arial control");
  check(
    "Arial stays Arial",
    arialRuns.length > 0 && arialRuns.every((r) => r.ascii === undefined || r.ascii === "Arial"),
    describe(arialRuns),
  );

  const ok = failures === 0;
  await writeGuardResult({
    id: "font-family-map",
    label: "Font-family mapping",
    passed: ok ? checksRun : checksRun - failures,
    total: checksRun,
    ok,
    unit: "w:rFonts font-family checks",
    command: "npm run guard:font-family-map",
  });
  console.log(ok ? `\nFont-family mapping guard passed (${checksRun} checks).` : `\n${failures} check(s) failed.`);
  console.log(`DOCX for Word inspection: ${path.join(OUT_DIR, "output.docx")}`);
  if (!ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
