import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateFile } from "@xarsh/ooxml-validator";
import { convertHtmlToDocx } from "../src/converter.js";
import { generateNovelHtmlCases } from "./novel-html-generator.js";
import { SUITE_OUTPUT } from "./output-paths.js";

const OUTPUT_DIR = path.join(SUITE_OUTPUT, "novel");
const RESULTS_JSON = path.join(OUTPUT_DIR, "results.json");

export interface NovelCaseResult {
  name: string;
  seed: number;
  xmlPassed: boolean;
  xmlErrors: string[];
  compileMs: number | null;
  error?: string;
}

export interface NovelRunResults {
  version: 1;
  kind: "novel";
  runAt: string;
  seed: number;
  caseCount: number;
  xmlPassCount: number;
  cases: NovelCaseResult[];
}

function parseSeed(): number {
  const fromEnv = process.env.NOVEL_SEED;
  if (fromEnv !== undefined) {
    const parsed = parseInt(fromEnv, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  const fromArg = process.argv.find((arg) => arg.startsWith("--seed="));
  if (fromArg) {
    const parsed = parseInt(fromArg.slice("--seed=".length), 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 42;
}

function parseCount(): number {
  const fromEnv = process.env.NOVEL_COUNT;
  if (fromEnv !== undefined) {
    const parsed = parseInt(fromEnv, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const fromArg = process.argv.find((arg) => arg.startsWith("--count="));
  if (fromArg) {
    const parsed = parseInt(fromArg.slice("--count=".length), 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 20;
}

async function runNovelCase(
  name: string,
  seed: number,
  html: string,
): Promise<NovelCaseResult> {
  const caseDir = path.join(OUTPUT_DIR, name);
  await mkdir(caseDir, { recursive: true });

  const result: NovelCaseResult = {
    name,
    seed,
    xmlPassed: false,
    xmlErrors: [],
    compileMs: null,
  };

  try {
    await writeFile(path.join(caseDir, "source.html"), html, "utf-8");

    const compileStart = performance.now();
    const docxBuffer = await convertHtmlToDocx(html);
    result.compileMs = performance.now() - compileStart;

    const docxPath = path.join(caseDir, "output.docx");
    await writeFile(docxPath, docxBuffer);

    const validation = await validateFile(docxPath, { officeVersion: "Office2019" });
    result.xmlPassed = validation.ok;
    if (!validation.ok) {
      result.xmlErrors = validation.errors.map(
        (e) => `[${e.errorType}] ${e.path}: ${e.description}`,
      );
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }

  return result;
}

function printReport(results: NovelRunResults): void {
  const line = "─".repeat(60);
  console.log(`\n${line}`);
  console.log("  HTML → DOCX Novel Generator — Smoke Test");
  console.log(line);
  console.log(`  Seed: ${results.seed}`);
  console.log(`  Cases: ${results.caseCount}`);
  console.log(`  XML pass: ${results.xmlPassCount} / ${results.caseCount}`);
  console.log(`  Output: ${OUTPUT_DIR}`);
  console.log(`  Results JSON: ${RESULTS_JSON}`);
  console.log(`  (Procedural HTML — not in the fixed regression suite)\n`);

  for (const r of results.cases) {
    const icon = r.error ? "!" : r.xmlPassed ? "✓" : "✗";
    console.log(`  [${icon}] ${r.name}`);
    if (r.compileMs !== null) {
      console.log(`      Compile: ${r.compileMs.toFixed(1)} ms`);
    }
    if (r.error) {
      console.log(`      Error: ${r.error}`);
    } else if (!r.xmlPassed) {
      for (const err of r.xmlErrors.slice(0, 3)) {
        console.log(`      ↳ ${err}`);
      }
      if (r.xmlErrors.length > 3) {
        console.log(`      ↳ … ${r.xmlErrors.length - 3} more`);
      }
    }
  }

  console.log(`\n${line}\n`);
}

async function main(): Promise<void> {
  const seed = parseSeed();
  const count = parseCount();
  const cases = generateNovelHtmlCases({ seed, count });

  await mkdir(OUTPUT_DIR, { recursive: true });
  console.log(`Running ${cases.length} novel HTML cases (seed ${seed}) → ${OUTPUT_DIR}`);

  const results: NovelCaseResult[] = [];
  for (const testCase of cases) {
    console.log(`  • ${testCase.name}`);
    results.push(await runNovelCase(testCase.name, testCase.seed, testCase.html));
  }

  const payload: NovelRunResults = {
    version: 1,
    kind: "novel",
    runAt: new Date().toISOString(),
    seed,
    caseCount: results.length,
    xmlPassCount: results.filter((r) => r.xmlPassed && !r.error).length,
    cases: results,
  };

  await writeFile(RESULTS_JSON, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  printReport(payload);

  if (payload.xmlPassCount !== payload.caseCount) {
    process.exitCode = 1;
  }
}

main();
