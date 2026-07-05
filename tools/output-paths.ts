import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Gitignored harness artifacts — all under `output/`. */
export const OUTPUT_ROOT = path.join(REPO_ROOT, "output");

/** Main regression suite (`npm run test:suite`) — standard baseline + edge cases. */
export const SUITE_OUTPUT = path.join(OUTPUT_ROOT, "suite");

/** OSS benchmark + style-source runs (`npm run test:benchmark`, `tsx tools/style-source-benchmark.ts`). */
export const BENCHMARK_OUTPUT = path.join(OUTPUT_ROOT, "benchmark");

/** Showcase harness scratch (`npm run test:showcase`). Committed copies live in `examples/`. */
export const SHOWCASE_OUTPUT = path.join(OUTPUT_ROOT, "showcase");

/** Stylesheet / class cascade suite (`tsx tools/css-cascade-runner.ts`). */
export const CSS_CASCADE_OUTPUT = path.join(OUTPUT_ROOT, "css-cascade");

/** Wild-HTML corpus runs (`npm run test:wild`) — real-world pages, see tools/wild-corpus-build.ts. */
export const WILD_OUTPUT = path.join(OUTPUT_ROOT, "wild");
