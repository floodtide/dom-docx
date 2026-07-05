import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateFile } from "@xarsh/ooxml-validator";
import { chromium } from "playwright";
import { wrapHtml } from "../src/html-wrap.js";
import { VIEWPORT_HEIGHT_PX, VIEWPORT_WIDTH_PX } from "../src/converter/constants.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BUNDLE_PATH = path.join(ROOT, "dist/browser/dom-docx.browser.js");
const VIEWPORT = { width: VIEWPORT_WIDTH_PX, height: VIEWPORT_HEIGHT_PX };

const spikeHtml = `
  <h1 style="color:#1a1a2e">Browser bundle spike</h1>
  <p>Converted entirely in-page with <strong>cheerio</strong> + <strong>docx</strong>.</p>
  <ol><li>One</li><li>Two</li></ol>
`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: VIEWPORT });

try {
  await page.setContent(wrapHtml(spikeHtml), { waitUntil: "domcontentloaded" });
  await page.addScriptTag({ path: BUNDLE_PATH });

  const byteList = await page.evaluate(async () => {
    const html = `
      <h1 style="color:#1a1a2e">Browser bundle spike</h1>
      <p>Converted entirely in-page with <strong>cheerio</strong> + <strong>docx</strong>.</p>
      <ol><li>One</li><li>Two</li></ol>
    `;
    return Array.from(
      await window.domDocx!.convertHtmlToDocxUint8Array(html, { styleSource: "inline" }),
    );
  });

  const bytes = new Uint8Array(byteList);
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new Error("spike: output is not a ZIP/docx");
  }

  const outPath = path.join(ROOT, "dist/browser/spike-output.docx");
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, bytes);

  const validation = await validateFile(outPath, { officeVersion: "Office2019" });
  if (!validation.ok) {
    console.error("spike: OOXML validation failed");
    process.exitCode = 1;
  } else {
    console.log(`spike: valid .docx (${bytes.length} bytes) → dist/browser/spike-output.docx`);
  }
} finally {
  await page.close();
  await browser.close();
}
