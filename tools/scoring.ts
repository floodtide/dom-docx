import { readFile } from "node:fs/promises";
import { strFromU8, unzipSync } from "fflate";

/** Composite Engine Score weights (see README). */
export const SCORE_WEIGHTS = {
  visual: 0.5,
  editability: 0.35,
  performance: 0.15,
} as const;

export interface MetricScores {
  visual: number | null;
  editability: number | null;
  performance: number | null;
  engine: number | null;
}

export interface EditabilityBreakdown {
  score: number;
  oneByOneTables: number;
  cantSplitLocks: number;
  tablePenalty: number;
  cantSplitPenalty: number;
}

export interface SuiteRollup extends MetricScores {
  caseCount: number;
  completedCount: number;
  xmlPassCount: number;
  avgPerformanceMs: number | null;
  /** Raw layout-fidelity average (before content-quality guards; `visual` is the guarded value). */
  layout: number | null;
  /** Raw pixelmatch average — report-only regression tripwire, not part of the engine score. */
  pixelMatch: number | null;
}

/** Map compilation duration (ms) → 0–100. See README anchors. */
export function performanceScore(durationMs: number): number {
  if (durationMs <= 15) return 100;
  if (durationMs >= 200) return 0;
  if (durationMs <= 30) return 100 - ((durationMs - 15) / 15) * 20;
  if (durationMs <= 100) return 80 - ((durationMs - 30) / 70) * 50;
  return 30 - ((durationMs - 100) / 100) * 30;
}

export async function readDocxDocumentXml(docxPath: string): Promise<string> {
  const buffer = await readFile(docxPath);
  const archive = unzipSync(new Uint8Array(buffer));
  const entry = archive["word/document.xml"];
  if (!entry) {
    throw new Error(`word/document.xml not found in ${docxPath}`);
  }
  return strFromU8(entry);
}

/** Single-row, single-cell tables used as layout wrappers (not tabular data). */
export function countOneByOneLayoutTables(documentXml: string): number {
  const tableBlocks = documentXml.match(/<w:tbl\b[\s\S]*?<\/w:tbl>/g) ?? [];
  let count = 0;

  for (const block of tableBlocks) {
    const rowCount = block.match(/<w:tr\b/g)?.length ?? 0;
    const firstRow = block.match(/<w:tr\b[\s\S]*?<\/w:tr>/)?.[0] ?? "";
    const cellCount = firstRow.match(/<w:tc\b/g)?.length ?? 0;
    if (rowCount === 1 && cellCount === 1) count += 1;
  }

  return count;
}

export function countCantSplitLocks(documentXml: string): number {
  return (documentXml.match(/<w:cantSplit\b/g) ?? []).length;
}

export function editabilityScoreFromXml(documentXml: string): EditabilityBreakdown {
  const oneByOneTables = countOneByOneLayoutTables(documentXml);
  const cantSplitLocks = countCantSplitLocks(documentXml);
  const tablePenalty = oneByOneTables * 10;
  const cantSplitPenalty = cantSplitLocks * 5;
  const score = Math.max(0, 100 - tablePenalty - cantSplitPenalty);

  return {
    score,
    oneByOneTables,
    cantSplitLocks,
    tablePenalty,
    cantSplitPenalty,
  };
}

export async function measureEditability(docxPath: string): Promise<EditabilityBreakdown> {
  const xml = await readDocxDocumentXml(docxPath);
  return editabilityScoreFromXml(xml);
}

export function compositeEngineScore(
  visual: number | null,
  editability: number | null,
  performance: number | null,
): number | null {
  if (visual === null || editability === null || performance === null) return null;
  return (
    visual * SCORE_WEIGHTS.visual +
    editability * SCORE_WEIGHTS.editability +
    performance * SCORE_WEIGHTS.performance
  );
}

export function average(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => v !== null && v !== undefined);
  if (nums.length === 0) return null;
  return nums.reduce((sum, v) => sum + v, 0) / nums.length;
}

export function rollupSuite(
  cases: Array<{
    visualMatch: number | null;
    editability: number | null;
    performance: number | null;
    engineScore: number | null;
    compileMs: number | null;
    xmlPassed: boolean;
    layout?: number | null;
    pixelMatch?: number | null;
    error?: string;
  }>,
): SuiteRollup {
  const completed = cases.filter((c) => !c.error);
  return {
    caseCount: cases.length,
    completedCount: completed.length,
    xmlPassCount: cases.filter((c) => c.xmlPassed).length,
    visual: average(completed.map((c) => c.visualMatch)),
    editability: average(completed.map((c) => c.editability)),
    performance: average(completed.map((c) => c.performance)),
    engine: average(completed.map((c) => c.engineScore)),
    avgPerformanceMs: average(completed.map((c) => c.compileMs)),
    layout: average(completed.map((c) => c.layout)),
    pixelMatch: average(completed.map((c) => c.pixelMatch)),
  };
}
