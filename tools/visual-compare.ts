import { readFile, writeFile } from "node:fs/promises";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { applyQualityPenalties, backgroundBalanceScoreFromPair, type BackgroundBalanceResult } from "./background-balance.js";
import { legibilityScoreFromPair, type LegibilityResult } from "./legibility.js";
import {
  countBulletMarkersInDisplayText,
  countOrderedListLinesInDisplayText,
  textContentFidelityScore,
  type TextContentFidelityResult,
} from "./text-content-fidelity.js";
import {
  htmlFragmentContainsList,
  htmlFragmentHasUnorderedList,
  listMarkerFidelityFromPair,
  type ListMarkerFidelityResult,
} from "./list-marker-fidelity.js";
import { layoutFidelityFromPair, type LayoutFidelityResult } from "./layout-fidelity.js";

const CONTENT_BOUNDS_PAD_PX = 4;
const CONTENT_WHITE_THRESHOLD = 250;
const SIDE_BY_SIDE_GAP_PX = 8;

export interface ContentBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PngComparison {
  mismatchedPixels: number;
  totalPixels: number;
  /**
   * Raw pixelmatch % — report-only REGRESSION TRIPWIRE since 2026-07-02, not the scored
   * visual signal. Human-label validation showed it has ~coin-flip concordance with
   * perceived quality (44.9%); it remains recorded because same-case deltas across runs
   * are still a sensitive "did anything change at all" alarm.
   */
  matchPercent: number;
  legibility: LegibilityResult;
  backgroundBalance: BackgroundBalanceResult;
  listMarkerFidelity: ListMarkerFidelityResult;
  /** Marker score after PDF-text corroboration — the value the marker penalty acts on. */
  listMarkerEffectiveScore?: number;
  textContentFidelity: TextContentFidelityResult | null;
  /**
   * Ink-projection layout similarity ("does it look right") — AA/subpixel-invariant,
   * human-label validated (85.6% concordance vs pixel's 44.9%; see
   * internal/research/visual-scoring-metric-research-2026-07-02.md §9). Computed on the
   * full uncropped page frames so absolute indent/position differences stay visible.
   */
  layoutFidelity: LayoutFidelityResult;
  /**
   * The scored visual signal: layout fidelity adjusted for legibility + background
   * balance + text-content + list-marker regressions (content/styling defects the
   * layout profiles cannot see). This is the engine score's visual component.
   */
  visualScore: number;
}

export interface ComparePngOptions {
  htmlDisplayText?: string;
  docxDisplayText?: string;
  /** Source HTML fragment; list-marker fidelity runs only when it contains `<ol>` or `<ul>`. */
  htmlFragment?: string;
}

function isContentPixel(r: number, g: number, b: number): boolean {
  return r < CONTENT_WHITE_THRESHOLD || g < CONTENT_WHITE_THRESHOLD || b < CONTENT_WHITE_THRESHOLD;
}

/** Bounding box of non-white pixels; null when the page is blank. */
export function contentBounds(img: PNG): ContentBounds | null {
  let minX = img.width;
  let minY = img.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (img.width * y + x) << 2;
      if (isContentPixel(img.data[i], img.data[i + 1], img.data[i + 2])) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < 0) return null;

  const x = Math.max(0, minX - CONTENT_BOUNDS_PAD_PX);
  const y = Math.max(0, minY - CONTENT_BOUNDS_PAD_PX);
  const w = Math.min(img.width - x, maxX - minX + 1 + CONTENT_BOUNDS_PAD_PX * 2);
  const h = Math.min(img.height - y, maxY - minY + 1 + CONTENT_BOUNDS_PAD_PX * 2);
  return { x, y, w, h };
}

function unionContentBounds(a: ContentBounds, b: ContentBounds): ContentBounds {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.w, b.x + b.w);
  const bottom = Math.max(a.y + a.h, b.y + b.h);
  return { x, y, w: right - x, h: bottom - y };
}

function cropPng(img: PNG, region: ContentBounds): PNG {
  const cropped = new PNG({ width: region.w, height: region.h });
  PNG.bitblt(img, cropped, region.x, region.y, region.w, region.h, 0, 0);
  return cropped;
}

function fillWhite(img: PNG): void {
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = 255;
    img.data[i + 1] = 255;
    img.data[i + 2] = 255;
    img.data[i + 3] = 255;
  }
}

/** HTML reference (left) and DOCX render (right) at full page size. */
export async function composeSideBySidePng(
  htmlPath: string,
  docxPath: string,
  outPath: string,
): Promise<void> {
  const html = PNG.sync.read(await readFile(htmlPath));
  const docx = PNG.sync.read(await readFile(docxPath));
  const gap = SIDE_BY_SIDE_GAP_PX;

  const width = html.width + gap + docx.width;
  const height = Math.max(html.height, docx.height);
  const composite = new PNG({ width, height });
  fillWhite(composite);

  PNG.bitblt(html, composite, 0, 0, html.width, html.height, 0, 0);
  PNG.bitblt(docx, composite, 0, 0, docx.width, docx.height, html.width + gap, 0);

  for (let y = 0; y < height; y++) {
    for (let x = html.width; x < html.width + gap; x++) {
      const i = (width * y + x) << 2;
      composite.data[i] = 0xdd;
      composite.data[i + 1] = 0xdd;
      composite.data[i + 2] = 0xdd;
      composite.data[i + 3] = 255;
    }
  }

  await writeFile(outPath, PNG.sync.write(composite));
}

export async function comparePngs(
  aPath: string,
  bPath: string,
  diffPath: string,
  options?: ComparePngOptions,
): Promise<PngComparison> {
  const imgA = PNG.sync.read(await readFile(aPath));
  const imgB = PNG.sync.read(await readFile(bPath));

  const width = Math.max(imgA.width, imgB.width);
  const height = Math.max(imgA.height, imgB.height);

  const normA = new PNG({ width, height });
  const normB = new PNG({ width, height });
  PNG.bitblt(imgA, normA, 0, 0, imgA.width, imgA.height, 0, 0);
  PNG.bitblt(imgB, normB, 0, 0, imgB.width, imgB.height, 0, 0);

  const boundsA = contentBounds(normA);
  const boundsB = contentBounds(normB);
  const compareRegion =
    boundsA && boundsB
      ? unionContentBounds(boundsA, boundsB)
      : { x: 0, y: 0, w: width, h: height };

  const cropA = cropPng(normA, compareRegion);
  const cropB = cropPng(normB, compareRegion);
  const diff = new PNG({ width: compareRegion.w, height: compareRegion.h });
  const mismatchedPixels = pixelmatch(
    cropA.data,
    cropB.data,
    diff.data,
    compareRegion.w,
    compareRegion.h,
    { threshold: 0.1 },
  );

  await writeFile(diffPath, PNG.sync.write(diff));

  const totalPixels = compareRegion.w * compareRegion.h;
  const matchPercent = ((totalPixels - mismatchedPixels) / totalPixels) * 100;
  // Full uncropped frames: cropping would erase absolute indent/position differences.
  const layoutFidelity = layoutFidelityFromPair(imgA, imgB);
  const legibility = legibilityScoreFromPair(cropA, cropB);
  const backgroundBalance = backgroundBalanceScoreFromPair(cropA, cropB);
  const htmlHasLists =
    options?.htmlFragment !== undefined
      ? htmlFragmentContainsList(options.htmlFragment)
      : undefined;
  const listMarkerFidelity = listMarkerFidelityFromPair(cropA, cropB, {
    htmlHasLists,
    htmlFragment: options?.htmlFragment,
    docxDisplayText: options?.docxDisplayText,
  });
  const textContentFidelity =
    options?.htmlDisplayText !== undefined && options?.docxDisplayText !== undefined
      ? textContentFidelityScore(options.htmlDisplayText, options.docxDisplayText)
      : null;

  let listMarkerScore = listMarkerFidelity.applicable ? listMarkerFidelity.score : undefined;
  const docxText = options?.docxDisplayText ?? "";
  const docxOrderedLines = docxText ? countOrderedListLinesInDisplayText(docxText) : 0;
  const docxBulletMarkers = docxText ? countBulletMarkersInDisplayText(docxText) : 0;
  const pixelMarkerMiss =
    listMarkerFidelity.applicable && listMarkerFidelity.docxMarkerLineCount === 0;
  const textShowsOrderedMarkers =
    docxOrderedLines >= Math.max(2, listMarkerFidelity.htmlMarkerLineCount);
  const textShowsBulletMarkers =
    options?.htmlFragment !== undefined &&
    htmlFragmentHasUnorderedList(options.htmlFragment) &&
    docxBulletMarkers >= Math.max(2, listMarkerFidelity.htmlMarkerLineCount);
  if (pixelMarkerMiss && (textShowsOrderedMarkers || textShowsBulletMarkers)) {
    listMarkerScore = 100;
  }

  // Scored visual = LAYOUT fidelity with content-quality guards on top. The guards catch
  // defects layout profiles cannot see (lost dark fills, missing/duplicated text, wrong
  // list markers). Marker regressions penalize through the ratio cap below only — keeping
  // them out of applyQualityPenalties avoids double-counting the same defect and keeps
  // the penalty independent of the 0.55 combined-factor floor.
  let visualScore = applyQualityPenalties(layoutFidelity.score, [
    legibility.score,
    backgroundBalance.score,
    textContentFidelity?.score,
  ]);
  if (
    listMarkerFidelity.applicable &&
    listMarkerFidelity.htmlMarkerLineCount >= 2 &&
    !(pixelMarkerMiss && (textShowsOrderedMarkers || textShowsBulletMarkers))
  ) {
    const markerRatio =
      listMarkerFidelity.docxMarkerLineCount / listMarkerFidelity.htmlMarkerLineCount;
    visualScore = Math.min(visualScore, layoutFidelity.score * (0.3 + 0.7 * markerRatio));
  }

  return {
    mismatchedPixels,
    totalPixels,
    matchPercent,
    legibility,
    backgroundBalance,
    listMarkerFidelity,
    listMarkerEffectiveScore: listMarkerScore,
    textContentFidelity,
    layoutFidelity,
    visualScore,
  };
}
