# Validation & scoring methodology

dom-docx is developed with a **Karpathy-style loop**: render reference HTML in Chromium, convert to DOCX, rasterize via LibreOffice, compare pixels and structure, iterate. This document describes how quality is measured. Latest numeric rollups live in [TEST-SCORES.md](./TEST-SCORES.md).

---

## Design priorities

| Priority | Goal | Why it matters |
|----------|------|----------------|
| **1. Visual acuity** | Output matches source layout when rendered, including list markers and display text | If it doesn't look right—or reads wrong—nothing else matters |
| **2. Post-creation editability** | Native Word structure—paragraphs, runs, lists—not layout hacks | Humans need to open, edit, and reuse documents |
| **3. Performance** | Fast compilation, no structural bloat | Slow or over-engineered markup doesn't scale |

---

## Engine score (0–100)

Overall quality is a weighted composite:

```
Engine Score = (Visual × 0.50) + (Editability × 0.35) + (Performance × 0.15)
```

| Component | Weight | Role |
|-----------|--------|------|
| **Visual (layout-based)** | 50% | Human-validated layout fidelity vs Chromium reference, plus content-quality guards |
| **Editability** | 35% | Structural fluidity for the human document lifecycle |
| **Performance** | 15% | TypeScript compilation speed; penalizes unnecessary complexity |

> **Methodology note (2026-07-02).** The visual component was switched from pixel-overlap (pixelmatch) to **ink-projection layout fidelity**. Validated against a 33-case human-labeled ground truth, pixel overlap had **44.9% pairwise concordance with human quality ratings (a coin flip; identical group means for "looks right" and "broken")**, while the layout metric reaches **85.6%** with monotonic separation. Pixel match is still computed and recorded on every case as a **regression tripwire** — same-case deltas remain a sensitive "did anything change" alarm — it just no longer contributes to the score. Full research trail: `internal/research/visual-scoring-metric-research-2026-07-02.md`.

---

## Visual match

**Script:** `npm run test:suite` → `tools/validator.ts`  
**Modules:** `tools/visual-compare.ts`, `tools/legibility.ts`, `tools/background-balance.ts`, `tools/list-marker-fidelity.ts`, `tools/text-content-fidelity.ts`

1. Wrap test HTML and screenshot with Playwright (`target_html.png`)
2. `convertHtmlToDocx()` → `output.docx`
3. OOXML schema validation (`@xarsh/ooxml-validator`)
4. LibreOffice → PDF → PNG (`output_docx.png`)
5. Extract display text from HTML (`htmlFragmentDisplayText()`) and from the PDF (`pdf-text.ts`) for fidelity checks
6. Compare rasters — see [Visual score](#visual-score-layout-fidelity--content-guards)

Artifacts live under `output/suite/{case}/`. Summary scores are in [TEST-SCORES.md](./TEST-SCORES.md).

### Visual score (layout fidelity + content guards)

The scored visual signal starts with **layout fidelity** (`tools/layout-fidelity.ts`): the two renders are reduced to **ink-projection profiles** and compared structurally, which makes the score invariant to the glyph-antialiasing/hinting noise that made pixel overlap unreliable.

- **Intensity-weighted profiles** — each pixel contributes `1 − luminance` (noise floor 0.02): a dark bar and a pale container background must not count the same, or fused/missing dark elements vanish from the profile.
- **Vertical profile** `V(y)` (line/row positions, spacing, rhythm) — matched with **banded DTW, band 12 px ≈ one text line**: cumulative spacing drift up to a line is forgiven; structural breaks are not (an unbounded warp measurably masks real defects).
- **Horizontal profile** `H(x)` (indent, alignment, margins) — same banded DTW; sub-line column shifts are forgiven while a real indent bug (e.g. 28 px) exceeds the band and costs.
- **Band-count factor** — distinct dark bands in the lightly-smoothed V profile are counted on each side and mismatch is penalized (`sqrt`-damped): catches "separate boxes fused into one mass", which smoothing + DTW absorb.
- **Ink-amount factor** — `0.85 + 0.15 × inkRatio` keeps missing/extra content penalized.
- Score = `100 × (0.55·Vsim + 0.45·Hsim) × inkFactor × bandFactor`. Because it is AA-invariant, **~100 is genuinely achievable for a correct render.**

**Human validation (2026-07-02):** all 33 suite renders were hand-labeled (blind — no scores shown, shuffled order) as looks-right / minor / broken. Pairwise concordance with those ratings: layout metric **85.6%** (group means 94.8 / 86.6 / 68.7); pixel overlap **44.9%** (group means 89.3 / 90.1 / 89.2 — no signal). Deliberately mismatched "broken control" pairs score ~26–36 on layout vs ~93 on pixel. Ground truth: `internal/research/human-labels.json`; relabel any time with `npm run label:renders`.

**Content-quality guards** are then applied on top — they catch defects layout profiles cannot see:

| Guard | Module | Catches |
|-------|--------|---------|
| **Legibility** | `legibility.ts` | Light text on dark fills with insufficient contrast (WCAG AA large-text threshold) |
| **Background balance** | `background-balance.ts` | Shaded blocks taller/shorter than the HTML reference |
| **List marker fidelity** | `list-marker-fidelity.ts` | Missing or wrong bullets/numbers on paired lines — **only when HTML contains `<ol>` or `<ul>`**; penalizes via the marker-ratio cap below, **not** via `applyQualityPenalties` (single penalty path — no double-counting) |
| **Text content fidelity** | `text-content-fidelity.ts` | Missing/extra tokens vs expected HTML display text (condensed char-bag compare; table-aware spacing) |

When legibility / background balance / text content are below 100, the layout score is multiplied by a non-linear penalty (`applyQualityPenalties` in `background-balance.ts`):

```typescript
// Each guard < 99.5 contributes: factor *= (score / 100) ** 1.35
// Combined factor is floored at 0.55 before multiplying the layout score
visualScore = layoutFidelity.score * factor;
```

**List-specific rules** (gated on list HTML):

- **Marker-ratio cap** — the *only* marker penalty path: when HTML has ≥2 marker lines, `visualScore` is capped at `layoutScore × (0.3 + 0.7 × docxMarkers/htmlMarkers)` if pixel pairing misses markers. Independent of the 0.55 floor, so a full marker loss can still cut to `0.3 × layoutScore`.
- **PDF text corroboration:** if pixels miss markers but LibreOffice PDF text shows ordered numbers or bullet glyphs (`•`/`◦`), the cap is skipped (fixes false penalties when layout differs but content is correct). The corroborated value is recorded as `listMarkerEffectiveScore`.
- **Diagnostics:** detected marker geometry (per-line `centerY`/`markerLeft`/`markerWidth`, matched DOCX line Ys, whether text rescue fired) is persisted as `listMarkerDetail` in `results.json` so score cliffs are diagnosable without re-running.

HTML display text for fidelity uses `htmlFragmentDisplayText()` (synthesizes `1. …` for `<ol>`) because Playwright `innerText` omits list numbers.

**Known limitations of the layout metric** (from the labeled set, documented in the module header): uniformly taller-but-complete content (`flex-row-horizontal`: cards ~2× taller, wrapped text) is under-penalized (~85); pure styling defects (wrong font size/color with same geometry) are invisible to it by design — that is the text-content/legibility guards' jurisdiction.

**Report-only signals** (recorded, never folded into `visualScore`):

- **Pixel match** (`matchPercent`, + `mismatchedPixels`) — raw `pixelmatch` (threshold 0.1) on the content bounding box. Demoted from the score on 2026-07-02 (coin-flip concordance with human ratings) but kept as a **regression tripwire**: for a fixed case, a pixel delta across runs is still the most sensitive "something changed" alarm.
- **Text order similarity** (`textOrderedSimilarity`) — LCS-based `2·LCS/(lenA+lenB)` on the condensed display text. The char-bag score is order-blind (reordered blocks/cells still score 100); this catches ordering regressions.

**Per-case visual score:** `0–100`. Raw layout components (`layoutVerticalScore`/`layoutHorizontalScore`/`layoutInkRatio`/`layoutBandCount*`), pixel tripwire, and all guards are recorded in `output/suite/results.json`, along with the **harness environment** (Chromium, LibreOffice, node, and key package versions via `environment.ts`) — renderer upgrades shift scores without converter changes, so historical comparisons need the version context.

### Calibration (pipeline-noise check)

`npm run test:calibration` pushes the **same HTML** through both pipeline sides (Chromium screenshot vs Chromium-printed PDF → pdf-to-img → same scorer) with **no conversion involved**, so any deficit is pipeline noise, not conversion error. Under layout-based scoring a perfect render scores ~100 here (that was the point of the switch); the run also reports the **pixel tripwire's** identity-pair ceiling (~94–99% depending on content, mean ~97.5), which is what "no pixel regression" should be read against. A *guard* firing during calibration flags a heuristic false positive on that case, not a conversion defect.

### Word render spot check

The loop scores against LibreOffice, but the real consumer is Microsoft Word — and the two disagree (LO ignores EXACT `w:line` in table rows, treats exact `trHeight` as a minimum). `tsx tools/word-spotcheck.ts` renders 5 anchor cases through **both** renderers and reports the adjusted-visual delta (`output/suite/word-spotcheck.json`), quantifying how much of the metric is LibreOffice-specific. Requires Word on macOS; skips cleanly when unavailable.

---

## Editability score

**Module:** `tools/scoring.ts` — scans `word/document.xml` from each generated `.docx`.

**Penalty matrix** (baseline **100**):

| Finding | Deduction |
|---------|-----------|
| Each 1×1 table wrapper simulating a `<div>` / block background | **−10** |
| Each hardcoded `<w:cantSplit>` page-break lock | **−5** |
| Pure native paragraphs + standard lists, no penalties | **100** |

Heuristics for “1×1 table wrapper”: single-row, single-cell table with shading/borders and no tabular semantics (e.g. one cell spanning full content width).

---

## Performance score

**Module:** `tools/scoring.ts` — `performance.now()` wraps `convertHtmlToDocx()` only (LibreOffice excluded).

**Score mapping** (1-page baseline):

| Duration | Score |
|----------|-------|
| ≤ 15 ms | **100** |
| 30 ms | **80** |
| 100 ms | **30** |
| ≥ 200 ms | **0** |

Linear interpolation between anchors; clamp to `[0, 100]`.

---

## Autonomous development loop

Each `npm run test:suite` run writes **`output/suite/results.json`** — the machine-readable objective for agents and CI:

```json
{
  "version": 1,
  "runAt": "2026-06-28T…",
  "objective": 91.51,
  "weights": { "visual": 0.5, "editability": 0.35, "performance": 0.15 },
  "suite": {
    "engine": 91.51,
    "visual": 86.03,
    "editability": 98,
    "performance": 99,
    "caseCount": 33,
    "xmlPassCount": 33
  },
  "cases": [ … ]
}
```

| Step | Action |
|------|--------|
| **Hypothesis** | Propose a converter change (e.g. list spacing tweak) |
| **Experiment** | Apply patch, run `npm run test:suite` |
| **Measure** | Read `results.json` → compare `objective`, `visualScore` vs `matchPercent`, and subscores |
| **Synthesize** | Keep change if `objective` ↑; inspect `diff_*.png` for visual regressions |
| **Next** | Iterate on lowest-scoring cases (`cases[].engineScore`) |

**Exit codes:** `0` = loop completed (metrics recorded). `1` = XML failure or runtime error.  
Use `npm run test:suite:strict` for zero-tolerance pixel CI (`--strict-visual`).

---

## OSS benchmark (same harness)

After `npm run test:suite`, run `npm run test:benchmark` to score **html-to-docx** and **@turbodocx/html-to-docx** through the same pipeline. See [BENCHMARK.md](./BENCHMARK.md).

---

## Design principles (conversion)

- **Fluid blocks:** Full-width backgrounds use native paragraph shading inside the 1″ content column (harness `padding: 96px` synced with Word margins). No negative-indent bleed or 1×1 tables when avoidable.
- **Inline vs block:** Background on blocks → paragraph shading; on inline tags → `TextRun` shading only.
- **Tables:** Reserved for real tabular data or unavoidable multi-side border boxes (OOXML element-order constraint).

Raw pixel match can look good while list numbers, missing text, or background blocks fail structural checks — those cases are penalized even when body text still aligns.

---

## Validation commands

| Command | Purpose |
|---------|---------|
| `npm run test:suite` | Full regression suite (33 cases) |
| `npm run test:suite:priority` | Fast subset (10 cases) |
| `npm run test:calibration` | Score-ceiling calibration (no conversion); add `-- --full` for all cases |
| `npm run test:benchmark` | OSS html-to-docx / TurboDocx comparison |
| `npm run test:inline-guard` | Assert inline path OOXML unchanged |
| `npm run test:config` | ConvertOptions OOXML assertions |

Maintainer-only (see [CONTRIBUTING.md](../CONTRIBUTING.md)): `tsx tools/word-spotcheck.ts`, `tsx tools/multipage-test.ts`, `tsx tools/novel-runner.ts`.
