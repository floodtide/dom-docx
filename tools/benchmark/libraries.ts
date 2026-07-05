import { htmlToDocxLibrary } from "./html-to-docx-adapter.js";
import { turbodocxLibrary } from "./turbodocx-adapter.js";
import type { BenchmarkLibrary } from "./types.js";

export const BENCHMARK_LIBRARIES: BenchmarkLibrary[] = [htmlToDocxLibrary, turbodocxLibrary];

export function resolveBenchmarkLibraries(arg?: string): BenchmarkLibrary[] {
  if (!arg || arg === "all") return BENCHMARK_LIBRARIES;
  const lib = BENCHMARK_LIBRARIES.find((l) => l.id === arg || l.npm === arg);
  if (!lib) {
    const ids = BENCHMARK_LIBRARIES.map((l) => l.id).join(", ");
    throw new Error(`Unknown benchmark library "${arg}". Expected one of: ${ids}, all`);
  }
  return [lib];
}
