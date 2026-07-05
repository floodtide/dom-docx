import type { PNG } from "pngjs";

/**
 * Layout fidelity — "does it look right to a human" (report-only for now).
 *
 * Compares ink-PROJECTION PROFILES of the two renders instead of raw pixels, so it is
 * invariant to the glyph-antialiasing / sub-pixel-hinting noise that caps pixelmatch at
 * ~94-95% on text-heavy pages. Validated against a 33-case human-labeled ground truth
 * (internal/research/human-labels.json): pairwise concordance with human ratings is
 * ~86% vs ~45% (= coin flip) for the pixel score. Research + tuning history:
 * internal/research/visual-scoring-metric-research-2026-07-02.md (§8-9).
 *
 * v1.1 design (each choice label-validated):
 * - INTENSITY-WEIGHTED profiles (1 − luminance), not binary ink: a dark bar and a pale
 *   container background must not count the same, or fused/missing dark elements vanish
 *   from the profile (caught flex-column-vertical and table-cell-bar-divs false-highs).
 * - Vertical profile V(y) → line/row positions, spacing, rhythm. Matched with BANDED DTW
 *   (band ≈ one line height): cumulative spacing drift up to a line is forgiven;
 *   structural breaks are not. Wider bands measurably mask real defects.
 * - Horizontal profile H(x) → indent, alignment, margins. Also banded DTW (band 12 px),
 *   which forgives sub-line column shifts (lifts correct tables) while a real indent bug
 *   (e.g. 28 px) still exceeds the band and costs.
 * - BAND-COUNT factor: count distinct dark bands in the lightly-smoothed V profile and
 *   penalize mismatch (sqrt-damped — raw counts flicker on overlapping elements). This is
 *   what catches "separate boxes fused into one mass", which smoothing+DTW absorb.
 * - Mild ink-amount factor keeps missing/extra content penalized.
 *
 * Known limitation (from the labeled set): uniformly taller-but-complete content
 * (flex-row-horizontal: cards ~2× taller, text wrapped) is under-penalized (~85).
 */

const LUMINANCE_NOISE_FLOOR = 0.02;
const SMOOTH_RADIUS_PX = 8;
/** ≈ one text line at harness scale: structure may drift locally by up to a line. */
const DTW_BAND_PX = 12;
/**
 * Vertical band grows with document length: benign per-line reflow drift
 * (different word-wrapping between Word and the browser) accumulates in
 * proportion to length, so a one-line band is right for a one-page doc but
 * far too tight for a five-page one. A structural break still costs — it
 * shows as unmatched ink MASS, which no band width can hide. The horizontal
 * band stays fixed (indent/alignment defects don't scale with length).
 * Fraction validated by band-length sweep against both label corpora
 * (see internal/research §12).
 */
const V_DRIFT_BAND_FRACTION = 0.02;
const V_WEIGHT = 0.55;
const H_WEIGHT = 0.45;
/** score ×= (INK_FLOOR + (1-INK_FLOOR)·inkRatio) — missing/extra ink can cost up to 15%. */
const INK_FLOOR = 0.85;
/**
 * Band detection: light smoothing + relative threshold + min run. Threshold tuned on the
 * calibration identity pairs (same HTML, both pipeline sides): 0.15 flickered 4-vs-2 on
 * overlapping elements (inline-svg-chart) even for near-identical renders; 0.10 requires
 * deep valleys, which is stable on identities while still splitting truly separated
 * blocks (flex-column-vertical 3/1, table-cell-bar-divs 4/1 stay caught).
 */
const BAND_SMOOTH_RADIUS_PX = 2;
const BAND_THRESHOLD_FRAC = 0.1;
const BAND_MIN_RUN_PX = 4;
/** Damping constant in (min+K)/(max+K) — small counts are noisy. */
const BAND_DAMPING = 2;

export interface LayoutFidelityResult {
  /** 0–100; ~100 = same layout structure. Report-only — not folded into visualScore. */
  score: number;
  /** 0–100 vertical-structure similarity (line positions / spacing / rhythm). */
  verticalScore: number;
  /** 0–100 horizontal-structure similarity (indent / alignment / margins). */
  horizontalScore: number;
  /** min(inkA,inkB)/max(inkA,inkB) — relative amount of (intensity-weighted) content. */
  inkRatio: number;
  /** Distinct dark-band counts in the V profile (reference / DOCX) — fused-block detector. */
  bandCountRef: number;
  bandCountDocx: number;
}

/** Intensity-weighted profiles: dark pixels count by darkness; near-white is ignored. */
function inkProfiles(img: PNG, width: number, height: number): { v: Float64Array; h: Float64Array } {
  const v = new Float64Array(height);
  const h = new Float64Array(width);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (img.width * y + x) << 2;
      const luminance =
        (0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2]) / 255;
      const weight = 1 - luminance;
      if (weight > LUMINANCE_NOISE_FLOOR) {
        v[y] += weight;
        h[x] += weight;
      }
    }
  }
  return { v, h };
}

/**
 * Trim trailing whitespace from a V profile: a document ending mid-page leaves
 * a large empty tail on the raster (the browser's min-height body does too).
 * Without the trim, length normalization squashes real content toward the top.
 * Missing-content differences still cost via the ink-amount factor.
 */
function trimTrailingWhitespace(v: Float64Array): Float64Array {
  let max = 0;
  for (const value of v) if (value > max) max = value;
  if (max <= 0) return v;
  const threshold = max * 0.005;
  let last = v.length - 1;
  while (last > 0 && v[last]! <= threshold) last--;
  // Keep a zero cushion past the content end: boxSmooth clamp-replicates the
  // edge element, so cutting at an ink-heavy last row would triple its weight
  // and distort the smoothed maximum (→ band-threshold, → band counts).
  const cushion = SMOOTH_RADIUS_PX * 2;
  return v.slice(0, Math.min(v.length, last + 1 + cushion));
}

/**
 * Linear resample to `n` samples. Used to normalize the DOCX V profile to the
 * reference length: a UNIFORM document-length difference (Word line boxes run a
 * few percent taller than the browser's, compounding over pages) is benign and
 * shouldn't consume the DTW band; local structural breaks survive resampling.
 */
function resampleProfile(a: Float64Array, n: number): Float64Array {
  if (a.length === n || a.length === 0) return a;
  const out = new Float64Array(n);
  const scale = a.length / n;
  for (let i = 0; i < n; i++) {
    const start = i * scale;
    const end = start + scale;
    let sum = 0;
    for (let j = Math.floor(start); j < Math.min(a.length, Math.ceil(end)); j++) {
      const lo = Math.max(start, j);
      const hi = Math.min(end, j + 1);
      if (hi > lo) sum += a[j]! * (hi - lo);
    }
    out[i] = sum;
  }
  return out;
}

function boxSmooth(a: Float64Array, radius: number): Float64Array {
  const n = a.length;
  const out = new Float64Array(n);
  let sum = 0;
  for (let i = -radius; i <= radius; i++) sum += a[Math.min(Math.max(i, 0), n - 1)];
  for (let i = 0; i < n; i++) {
    out[i] = sum / (2 * radius + 1);
    const add = Math.min(i + radius + 1, n - 1);
    const sub = Math.max(i - radius, 0);
    sum += a[add] - a[sub];
  }
  return out;
}

/** Normalize to sum=1 (compare shape, not absolute ink volume). */
function toDistribution(a: Float64Array): Float64Array {
  let sum = 0;
  for (const value of a) sum += value;
  if (sum === 0) return new Float64Array(a.length);
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] / sum;
  return out;
}

/**
 * Banded-DTW similarity between two distributions: minimal L1 cost along a monotonic
 * alignment path constrained to |i−j| ≤ band. similarity = 1 − cost/2 (each distribution
 * sums to 1, so total L1 mass is at most 2). The band bound is what preserves defect
 * detection — an unbounded warp lets broken structure "slide" into alignment.
 */
function bandedDtwSimilarity(a: Float64Array, b: Float64Array, band: number): number {
  const n = a.length;
  const m = b.length;
  if (n === 0 || m === 0) return 0;
  const effectiveBand = Math.max(band, Math.abs(n - m) + 1);
  const INF = Number.POSITIVE_INFINITY;

  let prevRow = new Float64Array(m + 1).fill(INF);
  prevRow[0] = 0;
  for (let i = 1; i <= n; i++) {
    const row = new Float64Array(m + 1).fill(INF);
    const lo = Math.max(1, i - effectiveBand);
    const hi = Math.min(m, i + effectiveBand);
    for (let j = lo; j <= hi; j++) {
      const cost = Math.abs(a[i - 1] - b[j - 1]);
      row[j] = cost + Math.min(prevRow[j], row[j - 1], prevRow[j - 1]);
    }
    prevRow = row;
  }

  const distance = prevRow[m];
  if (!Number.isFinite(distance)) return 0;
  return Math.max(0, 1 - distance / 2);
}

/** Distinct dark bands: maximal runs (≥ min length) above a fraction of the profile max. */
function bandCount(profile: Float64Array): number {
  const smoothed = boxSmooth(profile, BAND_SMOOTH_RADIUS_PX);
  let max = 0;
  for (const value of smoothed) if (value > max) max = value;
  if (max <= 0) return 0;
  const threshold = BAND_THRESHOLD_FRAC * max;
  let count = 0;
  let run = 0;
  for (const value of smoothed) {
    if (value > threshold) {
      run += 1;
    } else {
      if (run >= BAND_MIN_RUN_PX) count += 1;
      run = 0;
    }
  }
  if (run >= BAND_MIN_RUN_PX) count += 1;
  return count;
}

function totalInk(a: Float64Array): number {
  let sum = 0;
  for (const value of a) sum += value;
  return sum;
}

/**
 * Compare two renders on a shared canvas (both images interpreted at the same origin —
 * pass UNPADDED/UNCROPPED page rasters so absolute indent differences stay visible).
 */
/** Overrides for tuning sweeps; production callers use defaults. */
export interface LayoutFidelityOptions {
  vDriftBandFraction?: number;
}

export function layoutFidelityFromPair(
  htmlImg: PNG,
  docxImg: PNG,
  options: LayoutFidelityOptions = {},
): LayoutFidelityResult {
  const vDriftBandFraction = options.vDriftBandFraction ?? V_DRIFT_BAND_FRACTION;
  const width = Math.max(htmlImg.width, docxImg.width);

  const aRaw = inkProfiles(htmlImg, width, htmlImg.height);
  const bRaw = inkProfiles(docxImg, width, docxImg.height);
  // Long-document drift handling: when the CONTENT lengths (trailing
  // whitespace trimmed — partial last page / min-height body) differ
  // materially, normalize the DOCX flow to the reference length so uniform
  // stretch doesn't consume the DTW band. Near-equal lengths keep ABSOLUTE
  // alignment — resampling tiny differences would distort more than it fixes.
  const vRefTrimmed = trimTrailingWhitespace(aRaw.v);
  const vDocxTrimmed = trimTrailingWhitespace(bRaw.v);
  const lengthRatio = vDocxTrimmed.length / Math.max(1, vRefTrimmed.length);
  const materialDrift = lengthRatio > 1.03 || lengthRatio < 1 / 1.03;
  // Absolute path: zero-pad the trimmed profiles to one length (content starts
  // at 0 on both sides, so this is exact absolute alignment).
  const absoluteLength = Math.max(vRefTrimmed.length, vDocxTrimmed.length);
  const padTo = (v: Float64Array, n: number): Float64Array => {
    if (v.length >= n) return v;
    const out = new Float64Array(n);
    out.set(v);
    return out;
  };
  const a = {
    v: materialDrift ? vRefTrimmed : padTo(vRefTrimmed, absoluteLength),
    h: aRaw.h,
  };
  const b = {
    v: materialDrift
      ? resampleProfile(vDocxTrimmed, vRefTrimmed.length)
      : padTo(vDocxTrimmed, absoluteLength),
    h: bRaw.h,
  };

  const inkA = totalInk(a.v);
  const inkB = totalInk(b.v);
  if (inkA === 0 && inkB === 0) {
    return {
      score: 100,
      verticalScore: 100,
      horizontalScore: 100,
      inkRatio: 1,
      bandCountRef: 0,
      bandCountDocx: 0,
    };
  }
  if (inkA === 0 || inkB === 0) {
    return {
      score: 0,
      verticalScore: 0,
      horizontalScore: 0,
      inkRatio: 0,
      bandCountRef: bandCount(a.v),
      bandCountDocx: bandCount(b.v),
    };
  }

  const vA = toDistribution(boxSmooth(a.v, SMOOTH_RADIUS_PX));
  const vB = toDistribution(boxSmooth(b.v, SMOOTH_RADIUS_PX));
  const hA = toDistribution(boxSmooth(a.h, SMOOTH_RADIUS_PX));
  const hB = toDistribution(boxSmooth(b.h, SMOOTH_RADIUS_PX));

  const vBand = Math.max(DTW_BAND_PX, Math.round(vA.length * vDriftBandFraction));
  const verticalSim = bandedDtwSimilarity(vA, vB, vBand);
  const horizontalSim = bandedDtwSimilarity(hA, hB, DTW_BAND_PX);
  const inkRatio = Math.min(inkA, inkB) / Math.max(inkA, inkB);

  const bandsRef = bandCount(a.v);
  const bandsDocx = bandCount(b.v);
  const bandFactor = Math.sqrt(
    (Math.min(bandsRef, bandsDocx) + BAND_DAMPING) / (Math.max(bandsRef, bandsDocx) + BAND_DAMPING),
  );

  const shape = V_WEIGHT * verticalSim + H_WEIGHT * horizontalSim;
  const score = 100 * shape * (INK_FLOOR + (1 - INK_FLOOR) * inkRatio) * bandFactor;

  return {
    score: Math.round(score * 100) / 100,
    verticalScore: Math.round(verticalSim * 10000) / 100,
    horizontalScore: Math.round(horizontalSim * 10000) / 100,
    inkRatio: Math.round(inkRatio * 10000) / 10000,
    bandCountRef: bandsRef,
    bandCountDocx: bandsDocx,
  };
}
