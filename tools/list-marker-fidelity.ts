import * as cheerio from "cheerio";
import type { PNG } from "pngjs";
import {
  countBulletMarkersInDisplayText,
  countOrderedListLinesInDisplayText,
} from "./text-content-fidelity.js";
import { contentBounds, type ContentBounds } from "./visual-compare.js";

const MARKER_MAX_WIDTH_PX = 24;
const MIN_GAP_BETWEEN_MARKER_AND_TEXT_PX = 2;
const MIN_INK_PIXELS_PER_LINE = 6;
const MIN_LIST_MARKER_LINES = 2;
const LINE_Y_TOLERANCE_PX = 32;
const MARKER_COLUMN_TOLERANCE_PX = 12;
const MARKER_POSITION_TOLERANCE_PX = 28;
const MAX_MARKER_ZONE_WIDTH_RATIO = 1.6;

function relativeLuminance(r: number, g: number, b: number): number {
  const channel = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function isInkPixel(img: PNG, x: number, y: number): boolean {
  const i = (img.width * y + x) << 2;
  const r = img.data[i];
  const g = img.data[i + 1];
  const b = img.data[i + 2];
  if (r >= 248 && g >= 248 && b >= 248) return false;
  return relativeLuminance(r, g, b) <= 0.55;
}

function inkRows(img: PNG, bounds: ContentBounds): number[] {
  const rows: number[] = [];
  for (let y = bounds.y; y < bounds.y + bounds.h; y++) {
    let ink = 0;
    for (let x = bounds.x; x < bounds.x + bounds.w; x++) {
      if (isInkPixel(img, x, y)) ink += 1;
    }
    if (ink >= MIN_INK_PIXELS_PER_LINE) rows.push(y);
  }
  return rows;
}

function groupTextLines(rows: number[]): Array<{ centerY: number; rows: number[] }> {
  if (rows.length === 0) return [];
  const groups: number[][] = [[rows[0]!]];
  for (let i = 1; i < rows.length; i++) {
    const y = rows[i]!;
    const prev = rows[i - 1]!;
    if (y - prev <= 2) {
      groups[groups.length - 1]!.push(y);
    } else {
      groups.push([y]);
    }
  }
  return groups.map((lineRows) => ({
    rows: lineRows,
    centerY: Math.round(lineRows.reduce((a, b) => a + b, 0) / lineRows.length),
  }));
}

function inkXsInRow(img: PNG, bounds: ContentBounds, y: number): number[] {
  const xs: number[] = [];
  for (let x = bounds.x; x < bounds.x + bounds.w; x++) {
    if (isInkPixel(img, x, y)) xs.push(x);
  }
  return xs;
}

function mergedInkXs(img: PNG, bounds: ContentBounds, lineRows: number[]): number[] {
  const set = new Set<number>();
  for (const y of lineRows) {
    for (const x of inkXsInRow(img, bounds, y)) set.add(x);
  }
  return [...set].sort((a, b) => a - b);
}

interface MarkerLine {
  centerY: number;
  markerLeftRel: number;
  markerRightRel: number;
  textLeftRel: number;
  markerWidth: number;
}

function extractMarkerLine(img: PNG, bounds: ContentBounds, line: { centerY: number; rows: number[] }): MarkerLine | null {
  const xs = mergedInkXs(img, bounds, line.rows);
  if (xs.length < MIN_INK_PIXELS_PER_LINE) return null;

  let runStart = xs[0]!;
  for (let i = 1; i <= xs.length; i++) {
    const atEnd = i === xs.length;
    const x = atEnd ? xs[i - 1]! : xs[i]!;
    const prev = xs[i - 1]!;
    const gap = atEnd ? 1 : x - prev;

    if (!atEnd && gap <= 1) continue;

    const runEnd = prev;
    const markerWidth = runEnd - runStart + 1;
    const textStart = atEnd ? undefined : x;
    const textGap = textStart !== undefined ? textStart - runEnd - 1 : 0;

    if (
      markerWidth <= MARKER_MAX_WIDTH_PX &&
      textStart !== undefined &&
      textGap >= MIN_GAP_BETWEEN_MARKER_AND_TEXT_PX
    ) {
      return {
        centerY: line.centerY,
        markerLeftRel: runStart - bounds.x,
        markerRightRel: runEnd - bounds.x,
        textLeftRel: textStart - bounds.x,
        markerWidth,
      };
    }

    if (!atEnd) runStart = x;
  }

  return null;
}

function filterConsistentMarkers(markers: MarkerLine[]): MarkerLine[] {
  if (markers.length < 2) return markers;

  const markerLefts = [...markers.map((m) => m.markerLeftRel)].sort((a, b) => a - b);
  const medianMarkerLeft = markerLefts[Math.floor(markerLefts.length / 2)]!;

  // List numbers vary in width (`1.` vs `2.`) — align on marker column only.
  return markers.filter(
    (m) => Math.abs(m.markerLeftRel - medianMarkerLeft) <= MARKER_COLUMN_TOLERANCE_PX,
  );
}

/** Direct `<ol>`/`<ul>` children of body — excludes headings above the list. */
export function htmlDirectListItemCount(html: string): number {
  const $ = cheerio.load(`<body>${html.trim()}</body>`, { xml: false });
  let count = 0;
  $("body")
    .children("ol, ul")
    .each((_, list) => {
      count += $(list).children("li").length;
    });
  return count;
}

function trimToExpectedListItems<T extends { marker: MarkerLine }>(
  entries: T[],
  expectedCount: number,
): T[] {
  if (expectedCount <= 0 || entries.length <= expectedCount) return entries;
  return [...entries]
    .sort((a, b) => b.marker.centerY - a.marker.centerY)
    .slice(0, expectedCount)
    .sort((a, b) => a.marker.centerY - b.marker.centerY);
}

function docxLineHasMatchingMarker(
  docxImg: PNG,
  docxBounds: ContentBounds,
  docxLine: { centerY: number; rows: number[] },
  htmlMarker: MarkerLine,
): boolean {
  const docxMarker = extractMarkerLine(docxImg, docxBounds, docxLine);
  if (!docxMarker) return false;

  if (
    htmlMarker.markerLeftRel <= 20 &&
    docxMarker.markerLeftRel <= 20 &&
    htmlMarker.markerWidth <= 12 &&
    docxMarker.markerWidth <= 12
  ) {
    return true;
  }

  const markerPosDelta = Math.abs(htmlMarker.markerLeftRel - docxMarker.markerLeftRel);
  if (markerPosDelta > MARKER_POSITION_TOLERANCE_PX) return false;

  const widthDelta = Math.abs(docxMarker.markerWidth - htmlMarker.markerWidth);
  if (widthDelta <= 8) return true;
  if (docxMarker.markerWidth <= htmlMarker.markerWidth * 2) return true;
  return (
    docxMarker.markerWidth <= htmlMarker.markerWidth * MAX_MARKER_ZONE_WIDTH_RATIO &&
    docxMarker.markerWidth <= htmlMarker.markerWidth + 6
  );
}

function pairDocxLineByOrder(
  docxLines: Array<{ centerY: number; rows: number[] }>,
  htmlMarkers: MarkerLine[],
  index: number,
  used: Set<number>,
): { centerY: number; rows: number[] } | null {
  const byY = [...docxLines].sort((a, b) => a.centerY - b.centerY);
  const htmlSorted = [...htmlMarkers].sort((a, b) => a.centerY - b.centerY);
  const htmlMarker = htmlSorted[index];
  if (!htmlMarker) return null;

  let bestIndex = -1;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (let i = 0; i < byY.length; i++) {
    if (used.has(i)) continue;
    const delta = Math.abs(byY[i]!.centerY - htmlMarker.centerY);
    if (delta <= LINE_Y_TOLERANCE_PX && delta < bestDelta) {
      bestDelta = delta;
      bestIndex = i;
    }
  }

  if (bestIndex >= 0) {
    used.add(bestIndex);
    return byY[bestIndex]!;
  }

  bestIndex = -1;
  bestDelta = Number.POSITIVE_INFINITY;
  for (let i = 0; i < byY.length; i++) {
    if (used.has(i)) continue;
    const delta = Math.abs(byY[i]!.centerY - htmlMarker.centerY);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestIndex = i;
    }
  }
  if (bestIndex >= 0) {
    used.add(bestIndex);
    return byY[bestIndex]!;
  }

  return null;
}

export interface MarkerLineDetail {
  centerY: number;
  markerLeft: number;
  markerWidth: number;
  textLeft: number;
}

/** Intermediate detection data persisted to results JSON for diagnosing score cliffs. */
export interface ListMarkerFidelityDetail {
  expectedListItems: number;
  htmlMarkerLines: MarkerLineDetail[];
  /** centerY of DOCX lines that paired AND matched a marker. */
  docxMatchedLineYs: number[];
  /** True when pixel pairing missed but PDF display text corroborated the markers. */
  textRescueApplied: boolean;
}

export interface ListMarkerFidelityResult {
  /** 0–100; 100 = no detected list-marker regression. */
  score: number;
  htmlMarkerLineCount: number;
  docxMarkerLineCount: number;
  textLineCount: number;
  /** False when HTML has no list elements — marker detection skipped. */
  applicable: boolean;
  detail?: ListMarkerFidelityDetail;
}

/** True when the HTML fragment may produce list markers worth checking. */
export function htmlFragmentContainsList(html: string): boolean {
  return /<\s*(?:ol|ul)\b/i.test(html);
}

export function htmlFragmentHasUnorderedList(html: string): boolean {
  return /<\s*ul\b/i.test(html);
}

const NEUTRAL_LIST_MARKER: ListMarkerFidelityResult = {
  score: 100,
  htmlMarkerLineCount: 0,
  docxMarkerLineCount: 0,
  textLineCount: 0,
  applicable: false,
};

/**
 * Compare HTML list-marker zones to DOCX on matched text lines.
 * Catches missing ordered-list numbers even when body text still aligns.
 */
export function listMarkerFidelityFromPair(
  htmlImg: PNG,
  docxImg: PNG,
  options?: { htmlHasLists?: boolean; htmlFragment?: string; docxDisplayText?: string },
): ListMarkerFidelityResult {
  if (options?.htmlHasLists === false) {
    return NEUTRAL_LIST_MARKER;
  }

  const expectedListItems =
    options?.htmlFragment !== undefined ? htmlDirectListItemCount(options.htmlFragment) : 0;

  const htmlBounds = contentBounds(htmlImg);
  const docxBounds = contentBounds(docxImg);

  if (!htmlBounds || !docxBounds) {
    return { ...NEUTRAL_LIST_MARKER, applicable: true };
  }

  const htmlLines = groupTextLines(inkRows(htmlImg, htmlBounds));
  const htmlMarkerEntriesRaw = htmlLines
    .map((line) => ({
      line,
      marker: extractMarkerLine(htmlImg, htmlBounds, line),
    }))
    .filter((entry): entry is { line: typeof htmlLines[0]; marker: MarkerLine } => entry.marker !== null);

  const htmlMarkerEntries = trimToExpectedListItems(htmlMarkerEntriesRaw, expectedListItems);

  const htmlMarkers = filterConsistentMarkers(htmlMarkerEntries.map((e) => e.marker));
  const consistentEntries = htmlMarkerEntries.filter((e) =>
    htmlMarkers.some((m) => m.centerY === e.marker.centerY),
  );

  const firstMarkerY =
    htmlMarkers.length > 0
      ? Math.min(...htmlMarkers.map((m) => m.centerY))
      : Number.POSITIVE_INFINITY;
  const docxLines = groupTextLines(inkRows(docxImg, docxBounds)).filter(
    (line) => line.centerY >= firstMarkerY - 10,
  );

  let docxMatches = 0;
  const docxMatchedLineYs: number[] = [];
  const usedDocxLines = new Set<number>();
  for (let i = 0; i < consistentEntries.length; i++) {
    const { marker } = consistentEntries[i]!;
    const docxLine = pairDocxLineByOrder(
      docxLines,
      htmlMarkers,
      i,
      usedDocxLines,
    );
    if (
      docxLine &&
      docxLineHasMatchingMarker(docxImg, docxBounds, docxLine, marker)
    ) {
      docxMatches += 1;
      docxMatchedLineYs.push(docxLine.centerY);
    }
  }

  let textRescueApplied = false;
  if (
    options?.docxDisplayText &&
    htmlMarkers.length >= MIN_LIST_MARKER_LINES &&
    docxMatches < htmlMarkers.length
  ) {
    const docxOrderedLines = countOrderedListLinesInDisplayText(options.docxDisplayText);
    const docxBulletMarkers = countBulletMarkersInDisplayText(options.docxDisplayText);
    if (docxOrderedLines >= htmlMarkers.length && docxMatches >= htmlMarkers.length - 1) {
      docxMatches = htmlMarkers.length;
      textRescueApplied = true;
    } else if (
      options.htmlFragment &&
      htmlFragmentHasUnorderedList(options.htmlFragment) &&
      docxBulletMarkers >= htmlMarkers.length &&
      docxMatches >= htmlMarkers.length - 1
    ) {
      docxMatches = htmlMarkers.length;
      textRescueApplied = true;
    }
  }

  const detail: ListMarkerFidelityDetail = {
    expectedListItems,
    htmlMarkerLines: htmlMarkers.map((m) => ({
      centerY: m.centerY,
      markerLeft: m.markerLeftRel,
      markerWidth: m.markerWidth,
      textLeft: m.textLeftRel,
    })),
    docxMatchedLineYs,
    textRescueApplied,
  };

  if (htmlMarkers.length < MIN_LIST_MARKER_LINES) {
    return {
      score: 100,
      htmlMarkerLineCount: htmlMarkers.length,
      docxMarkerLineCount: docxMatches,
      textLineCount: htmlLines.length,
      applicable: true,
      detail,
    };
  }

  if (docxMatches === 0) {
    return {
      score: 0,
      htmlMarkerLineCount: htmlMarkers.length,
      docxMarkerLineCount: docxMatches,
      textLineCount: htmlLines.length,
      applicable: true,
      detail,
    };
  }

  const ratio = Math.min(docxMatches / htmlMarkers.length, 1);
  return {
    score: Math.round(ratio * 100),
    htmlMarkerLineCount: htmlMarkers.length,
    docxMarkerLineCount: docxMatches,
    textLineCount: htmlLines.length,
    applicable: true,
    detail,
  };
}
