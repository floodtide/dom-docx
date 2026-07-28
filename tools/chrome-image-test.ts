/**
 * Header/footer image guard — `data:` images in page chrome.
 *
 * A `data:` image passed via `headerHtml` / `footerHtml` has to reach the generated
 * `word/header*.xml` / `word/footer*.xml` as a real drawing with its bytes in
 * `word/media/`, not silently drop. Reported against html-to-docx
 * (privateOmega/html-to-docx#266) where a base64 header logo never appeared; the
 * footer path is covered here too since it shares the same code and the original
 * report did not test it.
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

/** 16x8 solid PNG. Small enough to inline; only its presence in the output matters. */
const LOGO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAICAIAAAB/FOjAAAAAF0lEQVR42mNkmLSbgRTAxEAiGNVADAAACHkBXYV9lZcAAAAASUVORK5CYII=";

interface Parts {
  headers: string[];
  footers: string[];
  media: string[];
}

async function convertParts(options: Parameters<typeof convertHtmlToDocx>[1]): Promise<Parts> {
  const buffer = await convertHtmlToDocx(`<p>Body paragraph.</p>`, options);
  const files = unzipSync(new Uint8Array(buffer));
  const dec = new TextDecoder();
  const names = Object.keys(files);
  const read = (re: RegExp) => names.filter((n) => re.test(n)).map((n) => dec.decode(files[n]!));
  return {
    headers: read(/^word\/header\d*\.xml$/),
    footers: read(/^word\/footer\d*\.xml$/),
    media: names.filter((n) => n.startsWith("word/media/") && n !== "word/media/"),
  };
}

const hasDrawing = (xml: string): boolean => xml.includes("<w:drawing") || xml.includes("<w:pict");

async function main(): Promise<void> {
  const chrome = `<div style="text-align:center;"><img src="${LOGO}" width="120" /></div>`;

  console.log("data: image in header:");
  const headerOnly = await convertParts({ onWarning: null, headerHtml: chrome });
  check("header part is generated", headerOnly.headers.length > 0);
  check("header contains a drawing", headerOnly.headers.some(hasDrawing));
  check("image bytes land in word/media/", headerOnly.media.length === 1, `got ${headerOnly.media.length}`);

  console.log("\ndata: image in footer:");
  const footerOnly = await convertParts({ onWarning: null, footerHtml: chrome });
  check("footer part is generated", footerOnly.footers.length > 0);
  check("footer contains a drawing", footerOnly.footers.some(hasDrawing));
  check("image bytes land in word/media/", footerOnly.media.length === 1, `got ${footerOnly.media.length}`);

  console.log("\nsame image in both (deduplicated):");
  const both = await convertParts({ onWarning: null, headerHtml: chrome, footerHtml: chrome });
  check("header contains a drawing", both.headers.some(hasDrawing));
  check("footer contains a drawing", both.footers.some(hasDrawing));
  check(
    "identical image stored once, not twice",
    both.media.length === 1,
    `got ${both.media.length} media parts`,
  );

  const ok = failures === 0;
  await writeGuardResult({
    id: "chrome-image",
    label: "Header/footer images",
    passed: ok ? checksRun : checksRun - failures,
    total: checksRun,
    ok,
    unit: "chrome image checks",
    command: "npm run guard:chrome-image",
  });
  console.log(
    ok ? `\nHeader/footer image guard passed (${checksRun} checks).` : `\n${failures} check(s) failed.`,
  );
  if (!ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
