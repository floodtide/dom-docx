import type { PNG } from "pngjs";
import { contentBounds, type ContentBounds } from "./visual-compare.js";

const BAND_HEIGHT_PX = 10;
const MIN_LIGHT_INK_PIXELS = 24;
const MIN_DARK_FILL_PIXELS = 400;
const MIN_CATASTROPHIC_PIXELS = 20;
const UNIFORM_NEIGHBOR_DELTA = 14;
/** WCAG AA contrast for large text (~18px+). */
const MIN_CONTRAST = 3.0;

function relativeLuminance(r: number, g: number, b: number): number {
  const channel = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function pixelRgb(img: PNG, x: number, y: number): [number, number, number] {
  const i = (img.width * y + x) << 2;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
}

function pixelLuminance(img: PNG, x: number, y: number): number {
  const [r, g, b] = pixelRgb(img, x, y);
  return relativeLuminance(r, g, b);
}

function maxChannelDelta(a: [number, number, number], b: [number, number, number]): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

function isPageWhite(r: number, g: number, b: number): boolean {
  return r >= 248 && g >= 248 && b >= 248;
}

/** True when most nearby samples match — flat fill, not glyph edge. */
function isUniformWithNeighbors(img: PNG, x: number, y: number): boolean {
  const center = pixelRgb(img, x, y);
  const offsets = [
    [-6, 0],
    [6, 0],
    [0, -6],
    [0, 6],
    [-6, -6],
    [6, 6],
  ];
  let similar = 0;
  let sampled = 0;

  for (const [dx, dy] of offsets) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= img.width || ny >= img.height) continue;
    sampled += 1;
    if (maxChannelDelta(center, pixelRgb(img, nx, ny)) <= UNIFORM_NEIGHBOR_DELTA) similar += 1;
  }

  return sampled >= 4 && similar / sampled >= 0.67;
}

interface BandStats {
  lightInkCount: number;
  darkFillCount: number;
  lightOnLightCount: number;
  maxLightLum: number;
  minDarkFillLum: number;
}

function analyzeBand(img: PNG, bounds: ContentBounds, bandY: number, bandH: number): BandStats {
  let lightInkCount = 0;
  let darkFillCount = 0;
  let lightOnLightCount = 0;
  let maxLightLum = 0;
  let minDarkFillLum = 1;

  const bgSamples: number[] = [];

  for (let y = bandY; y < bandY + bandH; y++) {
    for (let x = bounds.x; x < bounds.x + bounds.w; x++) {
      const [r, g, b] = pixelRgb(img, x, y);
      const lum = relativeLuminance(r, g, b);

      if (isUniformWithNeighbors(img, x, y)) {
        bgSamples.push(lum);
      }
    }
  }

  bgSamples.sort((a, b) => a - b);
  const bgLum = bgSamples.length > 0 ? bgSamples[Math.floor(bgSamples.length / 2)] : 1;

  for (let y = bandY; y < bandY + bandH; y++) {
    for (let x = bounds.x; x < bounds.x + bounds.w; x++) {
      const [r, g, b] = pixelRgb(img, x, y);
      if (isPageWhite(r, g, b)) continue;

      const lum = relativeLuminance(r, g, b);

      if (lum >= 0.62 && !isUniformWithNeighbors(img, x, y)) {
        lightInkCount += 1;
        maxLightLum = Math.max(maxLightLum, lum);
      }

      if (lum <= 0.22 && isUniformWithNeighbors(img, x, y)) {
        darkFillCount += 1;
        minDarkFillLum = Math.min(minDarkFillLum, lum);
      }

      if (lum < 0.62 || isUniformWithNeighbors(img, x, y)) continue;
      const contrast = contrastRatio(lum, bgLum);
      if (contrast < MIN_CONTRAST && bgLum >= 0.82) {
        lightOnLightCount += 1;
      }
    }
  }

  return {
    lightInkCount,
    darkFillCount,
    lightOnLightCount,
    maxLightLum,
    minDarkFillLum: darkFillCount > 0 ? minDarkFillLum : 1,
  };
}

/** HTML band has a substantial dark background fill (hero banner, table header row). */
function htmlHasDarkBanner(html: BandStats): boolean {
  return html.darkFillCount >= MIN_DARK_FILL_PIXELS;
}

/** DOCX band lost the dark fill — pale ink is now on a white page. */
function docxHasLostBackground(html: BandStats, docx: BandStats): boolean {
  if (!htmlHasDarkBanner(html)) return false;
  return (
    docx.darkFillCount < html.darkFillCount / 3 &&
    docx.lightOnLightCount >= MIN_CATASTROPHIC_PIXELS
  );
}

export interface LegibilityResult {
  /** 0–100; 100 = no detected readability regressions. */
  score: number;
  contentBandCount: number;
  illegibleBandCount: number;
  illegibleAreaRatio: number;
  worstContrast: number | null;
}

/**
 * Compare HTML reference vs DOCX output per horizontal band.
 * Penalizes when the reference uses light-on-dark styling but the DOCX render
 * drops the dark background (unreadable pale text on white).
 */
export function legibilityScoreFromPair(htmlImg: PNG, docxImg: PNG): LegibilityResult {
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

  let contentBandCount = 0;
  let illegibleBandCount = 0;
  let illegibleAreaPx = 0;
  let contentAreaPx = 0;
  let worstContrast: number | null = null;

  for (let bandY = bounds.y; bandY < bounds.y + bounds.h; bandY += BAND_HEIGHT_PX) {
    const bandH = Math.min(BAND_HEIGHT_PX, bounds.y + bounds.h - bandY);
    const bandArea = bounds.w * bandH;

    const html = analyzeBand(htmlImg, bounds, bandY, bandH);
    const docx = analyzeBand(docxImg, bounds, bandY, bandH);

    if (html.darkFillCount < MIN_DARK_FILL_PIXELS && html.lightInkCount < MIN_LIGHT_INK_PIXELS) {
      continue;
    }

    contentBandCount += 1;
    contentAreaPx += bandArea;

    if (htmlHasDarkBanner(html) && html.lightInkCount >= MIN_LIGHT_INK_PIXELS) {
      const contrast = contrastRatio(html.maxLightLum, html.minDarkFillLum);
      if (worstContrast === null || contrast < worstContrast) {
        worstContrast = contrast;
      }
    }

    if (docxHasLostBackground(html, docx)) {
      illegibleBandCount += 1;
      illegibleAreaPx += bandArea;
    }
  }

  if (contentBandCount === 0) {
    return {
      score: 100,
      contentBandCount: 0,
      illegibleBandCount: 0,
      illegibleAreaRatio: 0,
      worstContrast: null,
    };
  }

  const illegibleAreaRatio = illegibleAreaPx / contentAreaPx;
  const score = Math.max(0, 100 * (1 - illegibleAreaRatio));

  return {
    score,
    contentBandCount,
    illegibleBandCount,
    illegibleAreaRatio,
    worstContrast,
  };
}

