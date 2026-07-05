import { BODY_FONT_HALF_POINTS } from "./constants.js";
import { pxToTwips } from "./css.js";

/** CSS px from docx half-points (96 DPI reference). */
export function halfPointsToPx(halfPoints: number): number {
  return (halfPoints / 2) * (96 / 72);
}

export interface TextMeasureOptions {
  bold?: boolean;
  /** Font size in half-points; defaults to body size. */
  fontSizeHalfPoints?: number;
}

/** Approximate Arial advance width (em) by character class. */
function charWidthEm(ch: string): number {
  if (ch === " ") return 0.278;
  if (/[ijl.,:;!'|]/.test(ch)) return 0.25;
  if (/[ftr()[\]{}"-]/.test(ch)) return 0.33;
  if (/[0-9]/.test(ch)) return 0.556;
  if (ch === "I") return 0.3;
  if (/[MW]/.test(ch)) return 0.9;
  if (/[A-Z]/.test(ch)) return 0.7;
  if (/[mw]/.test(ch)) return 0.82;
  if (/[a-z]/.test(ch)) return 0.53;
  return 0.6;
}

/**
 * Estimate rendered text width for Arial-like sans-serif prose using per-class
 * glyph advances (flat per-char averages overestimate spaces and narrow glyphs,
 * skewing column-width distribution).
 */
export function estimateTextWidthPx(text: string, options: TextMeasureOptions = {}): number {
  if (!text) return 0;
  const fontSizePx = halfPointsToPx(options.fontSizeHalfPoints ?? BODY_FONT_HALF_POINTS);
  const boldScale = options.bold ? 1.06 : 1;
  let em = 0;
  for (const ch of text) em += charWidthEm(ch);
  return em * fontSizePx * boldScale;
}

export function estimateTextWidthTwips(text: string, options: TextMeasureOptions = {}): number {
  return pxToTwips(estimateTextWidthPx(text, options));
}

/** Minimum content width for empty or very short cells/items. */
export function minContentWidthTwips(minPx = 16): number {
  return pxToTwips(minPx);
}
