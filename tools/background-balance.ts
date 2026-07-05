import type { PNG } from "pngjs";
import { contentBounds, type ContentBounds } from "./visual-compare.js";

const MIN_FILL_ROW_PIXELS = 180;
const MIN_BLOCK_HEIGHT_PX = 18;
const MAX_BLOCK_HEIGHT_PX = 72;
const MIN_INK_PIXELS = 8;
const MIN_BALANCED_HTML = 0.38;
const MAX_IMBALANCED_DOCX = 0.32;
const MAX_CENTROID_DELTA = 0.22;
const MIN_PADDING_ASYMMETRY_PX = 6;
const MIN_EXTRA_FILL_RATIO = 1.35;
const FILL_COLOR_DELTA = 28;

function relativeLuminance(r: number, g: number, b: number): number {
  const channel = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function pixelRgb(img: PNG, x: number, y: number): [number, number, number] {
  const i = (img.width * y + x) << 2;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
}

function maxChannelDelta(a: [number, number, number], b: [number, number, number]): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

function isPageWhite(r: number, g: number, b: number): boolean {
  return r >= 248 && g >= 248 && b >= 248;
}

function isUniformWithNeighbors(img: PNG, x: number, y: number): boolean {
  const center = pixelRgb(img, x, y);
  const offsets = [
    [-5, 0],
    [5, 0],
    [0, -5],
    [0, 5],
  ];
  let similar = 0;
  let sampled = 0;

  for (const [dx, dy] of offsets) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= img.width || ny >= img.height) continue;
    sampled += 1;
    if (maxChannelDelta(center, pixelRgb(img, nx, ny)) <= 14) similar += 1;
  }

  return sampled >= 3 && similar / sampled >= 0.67;
}

function medianChannel(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

interface FillBlock {
  y0: number;
  y1: number;
  inkY0: number;
  inkY1: number;
  inkPixels: number;
  fillColor: [number, number, number];
}

interface BlockMetrics {
  block: FillBlock;
  height: number;
  topPad: number;
  bottomPad: number;
  balance: number;
  centroidRel: number;
}

interface FillRow {
  y: number;
  fillColor: [number, number, number];
}

function scanFillRow(img: PNG, bounds: ContentBounds, y: number): FillRow | null {
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];

  for (let x = bounds.x; x < bounds.x + bounds.w; x++) {
    if (isFillPixel(img, x, y)) {
      const [r, g, b] = pixelRgb(img, x, y);
      rs.push(r);
      gs.push(g);
      bs.push(b);
    }
  }

  if (rs.length < MIN_FILL_ROW_PIXELS) return null;

  return {
    y,
    fillColor: [medianChannel(rs), medianChannel(gs), medianChannel(bs)],
  };
}

function isFillPixel(img: PNG, x: number, y: number): boolean {
  const [r, g, b] = pixelRgb(img, x, y);
  if (isPageWhite(r, g, b)) return false;
  const lum = relativeLuminance(r, g, b);
  if (lum <= 0.18) return false;
  return isUniformWithNeighbors(img, x, y);
}

function isInkPixel(img: PNG, x: number, y: number): boolean {
  const [r, g, b] = pixelRgb(img, x, y);
  if (isPageWhite(r, g, b)) return false;
  if (isUniformWithNeighbors(img, x, y)) return false;
  return relativeLuminance(r, g, b) <= 0.55;
}

function inkBoundsInBlock(
  img: PNG,
  bounds: ContentBounds,
  block: FillBlock,
): { inkY0: number; inkY1: number; inkPixels: number } {
  const insetX = Math.max(24, Math.floor(bounds.w * 0.05));
  const x0 = bounds.x + insetX;
  const x1 = bounds.x + bounds.w - insetX;

  let inkY0 = Number.POSITIVE_INFINITY;
  let inkY1 = Number.NEGATIVE_INFINITY;
  let inkPixels = 0;

  for (let y = block.y0; y <= block.y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (!isInkPixel(img, x, y)) continue;
      inkPixels += 1;
      inkY0 = Math.min(inkY0, y);
      inkY1 = Math.max(inkY1, y);
    }
  }

  return { inkY0, inkY1, inkPixels };
}

function colorsSimilar(a: [number, number, number], b: [number, number, number]): boolean {
  return maxChannelDelta(a, b) <= FILL_COLOR_DELTA;
}

function finalizeFillBlock(
  img: PNG,
  bounds: ContentBounds,
  y0: number,
  y1: number,
  fillColor: [number, number, number],
): FillBlock {
  const shell: FillBlock = {
    y0,
    y1,
    inkY0: Number.POSITIVE_INFINITY,
    inkY1: Number.NEGATIVE_INFINITY,
    inkPixels: 0,
    fillColor,
  };
  const ink = inkBoundsInBlock(img, bounds, shell);
  return { ...shell, ...ink };
}

function detectFillBlocks(img: PNG, bounds: ContentBounds): FillBlock[] {
  const rows: FillRow[] = [];
  for (let y = bounds.y; y < bounds.y + bounds.h; y++) {
    const row = scanFillRow(img, bounds, y);
    if (row) rows.push(row);
  }

  const shells: Array<{ y0: number; y1: number; fillColor: [number, number, number] }> = [];
  let y0 = -1;
  let y1 = -1;
  let fillColor: [number, number, number] | null = null;

  for (const row of rows) {
    if (y0 < 0) {
      y0 = row.y;
      y1 = row.y;
      fillColor = row.fillColor;
      continue;
    }

    const adjacent = row.y === y1 + 1;
    const sameColor = fillColor && colorsSimilar(fillColor, row.fillColor);
    if (adjacent && sameColor) {
      y1 = row.y;
      continue;
    }

    shells.push({ y0, y1, fillColor: fillColor! });
    y0 = row.y;
    y1 = row.y;
    fillColor = row.fillColor;
  }

  if (y0 >= 0 && fillColor) shells.push({ y0, y1, fillColor });

  return shells
    .map((shell) => finalizeFillBlock(img, bounds, shell.y0, shell.y1, shell.fillColor))
    .filter((block) => {
      const height = block.y1 - block.y0 + 1;
      return (
        height >= MIN_BLOCK_HEIGHT_PX &&
        height <= MAX_BLOCK_HEIGHT_PX &&
        block.inkPixels >= MIN_INK_PIXELS &&
        Number.isFinite(block.inkY0)
      );
    });
}

function blockMetrics(img: PNG, bounds: ContentBounds, block: FillBlock): BlockMetrics {
  const ink = inkBoundsInBlock(img, bounds, block);
  const enriched = { ...block, ...ink };
  const height = enriched.y1 - enriched.y0 + 1;
  const topPad = enriched.inkY0 - enriched.y0;
  const bottomPad = enriched.y1 - enriched.inkY1;
  const balance = Math.min(topPad, bottomPad) / Math.max(topPad, bottomPad, 1);
  const centroidRel = (enriched.inkY0 + enriched.inkY1) / 2 - enriched.y0;
  return {
    block: enriched,
    height,
    topPad,
    bottomPad,
    balance,
    centroidRel: centroidRel / height,
  };
}

function overlapRatio(a: FillBlock, b: FillBlock): number {
  const overlap = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) + 1);
  const smaller = Math.min(a.y1 - a.y0, b.y1 - b.y0) + 1;
  return overlap / smaller;
}

function findBestDocxMatch(htmlBlock: FillBlock, docxBlocks: FillBlock[]): FillBlock | null {
  let best: FillBlock | null = null;
  let bestScore = 0;

  for (const docxBlock of docxBlocks) {
    if (!colorsSimilar(htmlBlock.fillColor, docxBlock.fillColor)) continue;
    const overlap = overlapRatio(htmlBlock, docxBlock);
    const yShift = Math.abs((htmlBlock.y0 + htmlBlock.y1) / 2 - (docxBlock.y0 + docxBlock.y1) / 2);
    const shiftPenalty = yShift > 48 ? 0 : 1 - yShift / 48;
    const score = overlap * shiftPenalty;
    if (score > bestScore) {
      bestScore = score;
      best = docxBlock;
    }
  }

  return bestScore >= 0.25 ? best : null;
}

function docxBackgroundImbalanced(html: BlockMetrics, docx: BlockMetrics): boolean {
  if (html.balance < MIN_BALANCED_HTML) return false;

  const padAsymmetry = Math.abs(html.topPad - html.bottomPad);
  const docxPadAsymmetry = Math.abs(docx.topPad - docx.bottomPad);
  if (docxPadAsymmetry < MIN_PADDING_ASYMMETRY_PX) return false;

  const htmlCentered = Math.abs(html.centroidRel - 0.5) <= 0.22;
  const docxOffCenter = Math.abs(docx.centroidRel - 0.5) >= 0.28;
  const centroidRegression =
    htmlCentered &&
    docxOffCenter &&
    Math.abs(docx.centroidRel - 0.5) - Math.abs(html.centroidRel - 0.5) >= MAX_CENTROID_DELTA;

  const balanceRegression =
    docx.balance <= MAX_IMBALANCED_DOCX &&
    html.balance - docx.balance >= 0.25 &&
    docxPadAsymmetry >= padAsymmetry + 4;

  const inkHeightHtml = html.block.inkY1 - html.block.inkY0 + 1;
  const inkHeightDocx = docx.block.inkY1 - docx.block.inkY0 + 1;
  const extraFill =
    docx.height >= html.height * MIN_EXTRA_FILL_RATIO &&
    inkHeightDocx <= inkHeightHtml * 1.4 &&
    docx.bottomPad >= html.bottomPad + 6;

  return balanceRegression || centroidRegression || extraFill;
}

export interface BackgroundBalanceResult {
  /** 0–100; 100 = no detected fill/padding imbalance regressions. */
  score: number;
  fillBlockCount: number;
  imbalancedBlockCount: number;
  imbalancedAreaRatio: number;
  /** Per-image fill blocks with ink padding metrics (debug / tuning). */
  debugBlocks?: Array<{
    side: "html" | "docx";
    y0: number;
    y1: number;
    topPad: number;
    bottomPad: number;
    height: number;
    balance: number;
    centroidRel: number;
    fillColor: [number, number, number];
  }>;
}

/** Penalize when shaded blocks look evenly padded in HTML but lopsided in DOCX. */
export function backgroundBalanceScoreFromPair(
  htmlImg: PNG,
  docxImg: PNG,
  options?: { debug?: boolean },
): BackgroundBalanceResult {
  const boundsA = contentBounds(htmlImg);
  const boundsB = contentBounds(docxImg);
  const bounds =
    boundsA && boundsB
      ? {
          x: Math.min(boundsA.x, boundsB.x),
          y: Math.min(boundsA.y, boundsB.y),
          w: Math.max(boundsA.x + boundsA.w, boundsB.x + boundsB.w) - Math.min(boundsA.x, boundsB.x),
          h: Math.max(boundsA.y + boundsA.h, boundsB.y + boundsB.h) - Math.min(boundsA.y, boundsB.y),
        }
      : (boundsA ?? boundsB ?? { x: 0, y: 0, w: htmlImg.width, h: htmlImg.height });

  const htmlBlocks = detectFillBlocks(htmlImg, bounds).map((block) =>
    blockMetrics(htmlImg, bounds, block),
  );
  const docxBlocks = detectFillBlocks(docxImg, bounds).map((block) =>
    blockMetrics(docxImg, bounds, block),
  );

  const debugBlocks = options?.debug
    ? [
        ...htmlBlocks.map((m) => ({
          side: "html" as const,
          y0: m.block.y0,
          y1: m.block.y1,
          topPad: m.topPad,
          bottomPad: m.bottomPad,
          height: m.height,
          balance: m.balance,
          centroidRel: m.centroidRel,
          fillColor: m.block.fillColor,
        })),
        ...docxBlocks.map((m) => ({
          side: "docx" as const,
          y0: m.block.y0,
          y1: m.block.y1,
          topPad: m.topPad,
          bottomPad: m.bottomPad,
          height: m.height,
          balance: m.balance,
          centroidRel: m.centroidRel,
          fillColor: m.block.fillColor,
        })),
      ]
    : undefined;

  let imbalancedAreaPx = 0;
  let totalFillAreaPx = 0;
  let imbalancedBlockCount = 0;

  for (const html of htmlBlocks) {
    const area = html.height * bounds.w;
    totalFillAreaPx += area;

    const docxMatch = findBestDocxMatch(html.block, docxBlocks.map((m) => m.block));
    if (!docxMatch) continue;

    const docx = blockMetrics(docxImg, bounds, docxMatch);
    if (docxBackgroundImbalanced(html, docx)) {
      imbalancedBlockCount += 1;
      imbalancedAreaPx += area;
    }
  }

  if (totalFillAreaPx === 0) {
    return {
      score: 100,
      fillBlockCount: 0,
      imbalancedBlockCount: 0,
      imbalancedAreaRatio: 0,
      debugBlocks,
    };
  }

  const imbalancedAreaRatio = imbalancedAreaPx / totalFillAreaPx;
  const score = Math.max(0, 100 * (1 - imbalancedAreaRatio));

  return {
    score,
    fillBlockCount: htmlBlocks.length,
    imbalancedBlockCount,
    imbalancedAreaRatio,
    debugBlocks,
  };
}

/** Combine raw pixelmatch % with quality subscores (non-linear when score < 100). */
export function applyQualityPenalties(
  pixelMatchPercent: number,
  scores: Array<number | undefined>,
): number {
  let factor = 1;
  for (const score of scores) {
    if (score === undefined || score >= 99.5) continue;
    factor *= (score / 100) ** 1.35;
  }
  if (factor < 1) {
    factor = Math.max(factor, 0.55);
  }
  return pixelMatchPercent * factor;
}
