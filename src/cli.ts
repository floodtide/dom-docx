#!/usr/bin/env node
/**
 * dom-docx CLI — convert an HTML fragment file to a native .docx.
 *
 *   npx dom-docx input.html -o output.docx
 *   cat fragment.html | npx dom-docx - -o out.docx
 *   npx dom-docx input.html -o - > out.docx        # binary to stdout
 *
 * Input is a BODY fragment (no <!DOCTYPE>/<html> wrapper needed). The default
 * inline path is pure JS; --style-source computed needs the optional peer
 * `playwright` (+ `npx playwright install chromium`) installed by the caller.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";
import { convertHtmlToDocx } from "./converter.js";

const USAGE = `Usage: dom-docx <input.html> [options]
       dom-docx - [options]              read HTML from stdin

Options:
  -o, --output <file>      output path (default: <input>.docx; "-" writes binary to stdout)
  -s, --style-source <s>   "inline" (default, pure JS) or "computed"
                           (requires: npm i playwright && npx playwright install chromium)
  -h, --help               show this help
  -v, --version            print version

Input is a body HTML fragment — headings, paragraphs, lists, tables, inline
styles. See https://github.com/freeman-g/dom-docx#readme for what converts best.`;

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf-8");
}

async function packageVersion(): Promise<string> {
  try {
    const pkg = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf-8"),
    ) as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

function fail(message: string): never {
  console.error(`dom-docx: ${message}`);
  console.error(`Try: dom-docx --help`);
  process.exit(1);
}

function parseCliArgs() {
  return parseArgs({
    allowPositionals: true,
    options: {
      output: { type: "string", short: "o" },
      "style-source": { type: "string", short: "s" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });
}

async function main(): Promise<void> {
  let parsed: ReturnType<typeof parseCliArgs>;
  try {
    parsed = parseCliArgs();
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

  const { values, positionals } = parsed;
  if (values.help) {
    console.log(USAGE);
    return;
  }
  if (values.version) {
    console.log(await packageVersion());
    return;
  }

  const input = positionals[0];
  if (!input) fail("missing input file (or '-' for stdin)");
  if (positionals.length > 1) fail(`unexpected extra arguments: ${positionals.slice(1).join(" ")}`);

  const styleSource = (values["style-source"] ?? "inline") as string;
  if (styleSource !== "inline" && styleSource !== "computed") {
    fail(`--style-source must be "inline" or "computed" (got "${styleSource}")`);
  }

  const html =
    input === "-"
      ? await readStdin()
      : await readFile(input, "utf-8").catch(() => fail(`cannot read ${input}`));
  if (!html.trim()) fail("input HTML is empty");

  const output =
    values.output ??
    (input === "-"
      ? "output.docx"
      : path.join(path.dirname(input), `${path.basename(input, path.extname(input))}.docx`));

  let docx: Buffer;
  try {
    docx = await convertHtmlToDocx(html, { styleSource });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (styleSource === "computed" && /playwright/i.test(message)) {
      fail(
        `computed styles need the optional peer dependency:\n  npm install playwright && npx playwright install chromium\n(${message})`,
      );
    }
    fail(`conversion failed: ${message}`);
  }

  if (output === "-") {
    process.stdout.write(docx);
    return;
  }
  await writeFile(output, docx);
  console.error(`dom-docx: wrote ${output} (${docx.length} bytes)`);
}

main().catch((err) => {
  console.error(`dom-docx: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
