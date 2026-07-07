# Benchmark: OSS HTML→DOCX vs dom-docx

Generate via `npm run test:benchmark`.

All libraries use the **same visual harness**: human-validated **layout fidelity** (ink-projection structure comparison; 85.6% concordance with blind human quality ratings vs 44.9% for pixel overlap) plus content-quality guards (legibility, background balance, list marker fidelity, text content fidelity). List marker checks run only when HTML contains `<ol>`/`<ul>`. Raw pixel match is recorded per case as a regression tripwire but contributes to no score. See [SCORING.md](./SCORING.md).

## Libraries under test

| ID | Package | Version | Notes |
|----|---------|---------|-------|
| `html-to-docx` | [`html-to-docx`](https://www.npmjs.com/package/html-to-docx) | 1.8.0 | Original npm package (~337k/week) |
| `turbodocx` | [`@turbodocx/html-to-docx`](https://www.npmjs.com/package/@turbodocx/html-to-docx) | 1.22.0 | Active fork (list-style-type, SVG, fixes) |

Both libraries use the same harness options (letter page, 1″ margins, Arial 14px).

### Schema note

Both JS libraries fail Office 2019 OOXML schema validation on every case (`w:sectPr` before body content). LibreOffice still renders them; visual scoring proceeds. dom-docx: **33 / 33** XML pass.

---

## Suite summary (33 cases)

| Metric | html-to-docx | turbodocx | dom-docx |
|--------|-------------:|----------:|---------:|
| XML schema pass | 0 / 33 | 0 / 33 | **33 / 33** |
| Avg **visual (layout-based)** | 65.13% | 65.13% | **92.66%** |
| Avg editability | 100.00 | 100.00 | 99.70 |
| Avg engine score | 82.18 | 81.97 | **94.03** |
| Avg compile | 14.8 ms | 18.7 ms | 26.9 ms |

(The two OSS averages matching to 2 decimals is coincidence — they differ on 30 of 33 cases.)

Δ vs dom-docx (library − dom-docx):

| Library | Δ visual | Δ engine |
|---------|---------:|---------:|
| html-to-docx | **−27.5 pp** | −11.85 |
| turbodocx | **−27.5 pp** | −12.06 |

**dom-docx wins 31 / 33 cases outright** (beats both competitors). The 2 exceptions are marginal and specific:

- `heading-hierarchy` — TurboDocx marginally ahead (88.9 vs 86.7); dom-docx renders slightly compact vertical rhythm.
- `simple-blockquote` — html-to-docx slightly ahead (94.6 vs 92.1); dom-docx blockquote indent runs 28px shallow.

(A third loss surfaced by the metric switch — `table-cell-bar-divs`, where dom-docx dropped the CSS trend bar and TurboDocx led 89.3 vs 59.8 — was **fixed the same day**: bar divs in cells now render as native shaded bands, 59.8 → **98.6**, retaking the case. That's the honest-metric loop working as intended: the scoreboard surfaced a real bug, and fixing the bug — not the metric — recovered it.)

---

## Notable per-case deltas (turbodocx vs dom-docx, layout-based visual)

| Test | turbodocx | dom-docx | Δ | Notes |
|------|----------:|---------:|--:|-------|
| `inline-svg-chart` | 1.92% | 96.81% | −94.9 | dom-docx native SVG bands; TurboDocx output structurally unrelated to reference |
| `image-figure` | 30.72% | 99.35% | −68.6 | dom-docx `<figure>` + caption |
| `typography-colors` | 33.32% | 90.22% | −56.9 | dom-docx color/background bands |
| `mixed-margins-paddings` | 40.44% | 94.24% | −53.8 | dom-docx margin/padding box model |
| `flex-row-horizontal` | 31.93% | 85.28% | −53.4 | dom-docx flex cards (still short of HTML — human-rated broken) |
| `flex-column-vertical` | 22.08% | 97.74% | −75.7 | Was defective on both sides (dom-docx fused boxes); dom-docx fixed 2026-07-03 — gaps render as unshaded spacer rows |
| `nested-blockquotes-lists` | 6.83% | 54.41% | −47.6 | Both flatten nesting; TurboDocx collapses it entirely |
| `inline-vs-block` | 52.94% | 97.71% | −44.8 | dom-docx inline/block backgrounds |
| `heading-hierarchy` | 88.94% | 86.68% | +2.3 | TurboDocx marginally ahead |
| `table-cell-bar-divs` | 89.32% | 98.58% | −9.3 | Was dom-docx's one real loss (bars dropped, 59.8); fixed 2026-07-02 — bars render as native shaded bands |

### Notable per-case deltas (html-to-docx vs dom-docx)

| Test | html-to-docx | dom-docx | Δ | Notes |
|------|-------------:|---------:|--:|-------|
| `inline-svg-chart` | 2.46% | 96.81% | −94.3 | dom-docx SVG handler |
| `table-row-backgrounds` | 28.03% | 99.24% | −71.2 | dom-docx table shading |
| `image-figure` | 29.29% | 99.35% | −70.1 | dom-docx figure + caption |
| `typography-colors` | 28.95% | 90.22% | −61.2 | dom-docx color/background bands |
| `flex-row-horizontal` | 25.78% | 85.28% | −59.5 | dom-docx flex cards |
| `unicode-emoji-content` | 44.74% | 96.07% | −51.3 | dom-docx emoji text handling |
| `nested-blockquotes-lists` | 8.48% | 54.41% | −45.9 | Same nested-structure weakness, worse |
| `flex-column-vertical` | 27.34% | 97.74% | −70.4 | Same column-flex weakness (dom-docx fixed 2026-07-03) |
| `image-block` | 98.30% | 98.41% | −0.1 | Near-tie |
| `simple-blockquote` | 94.62% | 92.08% | +2.5 | html-to-docx slightly ahead (dom-docx indent 28px shallow) |

### List comparison (layout-based visual)

| Library | `simple-ordered-list` | `simple-unordered-list` | `ordered-list-lower-alpha` | `ordered-list-upper-roman` | `unordered-list-square` |
|---------|----------------------:|------------------------:|---------------------------:|---------------------------:|------------------------:|
| dom-docx | **96.34%** | **96.49%** | **96.65%** | **96.41%** | **96.32%** |
| html-to-docx | 89.33% | 71.87% | 94.16% | 93.26% | 86.56% |
| turbodocx | 92.26% | 70.00% | 64.54% | 67.63% | 67.89% |

dom-docx leads on all five list cases (~96.5% across the board — under the AA-invariant metric, its lists score as what they are: correct). TurboDocx regresses sharply on custom `list-style-type` variants (~65–68%).

---

## Style source: inline vs computed-oracle vs computed-native (dom-docx)

Run: `tsx tools/style-source-benchmark.ts` (requires fresh `npm run test:suite` baseline in `output/suite/results.json`).

Same harness, three style-resolution lanes.

- **inline** — default `style=""` resolver, pure JS, runs anywhere.
- **computed-oracle** — `convertHtmlToDocx(html, { styleSource: "computed", browser })` spawns its own Playwright page per call (server-side `getComputedStyle` batch).
- **computed-native** — `convertHtmlToDocx(html, { styleSource: "computed", page })` reads computed styles from an **already-rendered** page (the in-browser deployment lane: the page exists, `getComputedStyle` is free, no second render).

| Metric | inline | computed-oracle | computed-native | native − inline |
|--------|-------:|----------------:|----------------:|----------------:|
| XML schema pass | 28 / 28 | 28 / 28 | 28 / 28 | 0 |
| Avg **adjusted** visual | 88.66% | 88.32% | **88.32%** | **−0.35 pp** |
| Avg editability | 99.64 | 99.64 | 99.64 | 0.00 |
| Avg engine score | 92.99 | 79.03 | **91.80** | −1.20 |
| Avg compile | 21.5 ms | ~632.2 ms | **~26.7 ms** | +5.2 ms |

**The headline:** computed-native delivers the *exact* computed-style fidelity of the oracle (`native − oracle = +0.00 pp` adjusted visual — see parity guard below) at inline-level speed (~26.7 ms/case). The oracle's −14 pt engine-score drop is **entirely** the per-call Playwright spin-up; in the browser, where the page already exists, that cost disappears and the engine score returns to ~92.

**On the inline-style suite the three lanes now sit within 0.35 pp** — inline-only HTML produces near-identical output through all three resolvers. Computed's real advantage shows up on the **CSS-cascade suite** below, where styling lives in `<style>`/class selectors the inline path can't see.

**Parity guard:** `tsx tools/computed-parity-guard.ts` — oracle and native feed the same snapshots into the same OOXML builder, so for identical HTML they emit **byte-identical** normalized `word/*.xml`. **30/30 byte-identical.** A divergence would isolate a bug to snapshot extraction (ambient page vs spawned page) — the only thing that differs between the lanes.

**Browser bundle guard:** `npm run build:browser && tsx scripts/browser-spike.ts && tsx tools/browser-build-parity.ts` — esbuild IIFE (`dom-docx/browser`) runs in-page via Playwright, converts with `getComputedStyle(document…)` + `Packer.toBlob`, and asserts normalized `word/*.xml` parity with the Node computed-native path. **30/30 byte-identical.** Spike validates OOXML schema on a minimal inline fragment.

**Inline path guard:** `npm run test:inline-guard` — 28/28 equivalent (default vs explicit `styleSource: "inline"`); the default path stays byte-identical.

> **On Playwright:** in the **native** lane Playwright is only the *test host* — a headless browser to exercise the in-page code path under CI. The real browser-side deployment calls `getComputedStyle` on the live `document` with **no Playwright and no server**. The **oracle** lane is the genuine server-side path where Playwright is a runtime dependency.

---

## CSS cascade suite (stylesheet / class selectors)

Run: `tsx tools/css-cascade-runner.ts` · Cases: `tools/css-cascade-cases.ts` · Output: `output/css-cascade/results.json`

Separate from the 28-case loop — HTML uses `<style>` blocks and `class` / `#id` selectors with **no** matching inline `style=""` on styled nodes (except `stylesheet-inline-wins`).

| Metric | inline | computed | Δ |
|--------|-------:|---------:|--:|
| Avg adjusted visual | 68.04% | 82.24% | **+14.20 pp** |
| Cases passed | — | 7 / 8 | — |

**Largest computed wins:** `stylesheet-section-theme` (+49.2 pp), `stylesheet-descendant-table` (+48.8 pp), `stylesheet-strong-em` (+7.0 pp), `stylesheet-p-color` (+4.0 pp).

**Control case:** `stylesheet-inline-wins` — inline `style=""` overrides class; both paths ~88%.

These are the cases where computed styles matter most. The runner uses the oracle resolver; per the parity guard, **computed-native produces byte-identical output**, so this cascade win applies to the browser-side lane at native speed (~27 ms/case) rather than the oracle's ~630 ms.

---

## Takeaways

1. **dom-docx leads layout-based visual by ~27.5 pp** — 92.66% vs 65.13% for both OSS libraries. Engine score: 94.03 vs ~82. The human-validated metric *widened* the gap: pixel overlap had been flattering broken competitor output (wrong-position ink still overlaps on mostly-white pages).
2. **dom-docx wins on validity** (XML 33/33 vs 0/33 for both). OSS libraries compile faster (15–19 ms vs 26 ms) but trail heavily on visual quality.
3. **dom-docx wins 31/33 cases outright.** Structural strengths: SVG bands (96.8 vs ~2), table shading (99.2 vs 28), figures (99.4 vs ~30), in-cell bar divs (98.6 vs 89.3), typography/color bands (90.2 vs ~29–33), emoji (96.1 vs 44.7), lists (~96.5 across all five vs 65–94).
4. **The 2 remaining dom-docx losses are marginal** — `heading-hierarchy` (−2.3, compact rhythm), `simple-blockquote` (−2.5, indent 28px shallow). The one *material* loss the metric switch surfaced (`table-cell-bar-divs`, dropped trend bar) was fixed same-day: 59.8 → 98.6.
5. **The scoreboard is now also the bug tracker** — the suite's lowest scores are the renders a blind human labeled broken/minor (`nested-blockquotes-lists` 54.4, `horizontal-rule` 73.7), and fixing what it flags moves the score to match the eye — two of the four human-broken renders (bar divs, flex-column) were fixed within a day of the metric landing.

---

## Commands

```bash
npm run test:suite                  # refresh dom-docx baseline (run before benchmark)
npm run test:benchmark             # html-to-docx + turbodocx (all)
npm run test:benchmark -- turbodocx
npm run test:benchmark -- html-to-docx
npm run test:inline-guard          # assert inline default unchanged
```

Style-source, CSS-cascade, and parity guards: [CONTRIBUTING.md](../CONTRIBUTING.md#maintainer-only-harness-commands).

## Artifacts

```
output/
  suite/                       # test:suite — standard baseline + edge cases
  benchmark/                   # test:benchmark, style-source
    results.json
    results-html-to-docx.json
    results-turbodocx.json
    html-to-docx/{name}/
    turbodocx/{name}/
    style-source/
  showcase/                    # test:showcase scratch (committed copies in examples/)
  css-cascade/                 # tsx tools/css-cascade-runner.ts
```

Adapters: `tools/benchmark/html-to-docx-adapter.ts`, `tools/benchmark/turbodocx-adapter.ts` · Style source: `tools/style-source-benchmark.ts`

Competitor research notes: local `internal/research/RESEARCH.md` (gitignored).
