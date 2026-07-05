# Validation scores

Latest suite metrics from `npm run test:suite`. **How scores are computed:** [SCORING.md](./SCORING.md).

**Run:** 2026-07-03T20:35Z · Chromium 149.0.7827.55 · LibreOffice 26.2.4.2 · 35 cases

> **Methodology change (2026-07-02): visual score is now layout-based.** The scored visual signal switched from pixel overlap to **ink-projection layout fidelity + content-quality guards** after blind human labeling of all 33 renders showed pixel overlap had coin-flip concordance (44.9%) with human quality judgments while the layout metric reaches 85.6% ([SCORING.md](./SCORING.md)). Raw pixel match is still recorded per case as a regression tripwire. Numbers below are **not comparable** to earlier (pixel-based) score history.

## Summary

| Metric | Standard (17) | Edge (18) | All (35) |
|--------|---------------|-----------|----------|
| XML schema pass | 17 / 17 | 18 / 18 | **35 / 35** |
| Avg **visual (layout-based)** | 95.38% | 95.76% | **95.57%** |
| Avg raw layout (pre-guards) | — | — | 95.57% |
| Avg pixel match (tripwire, unscored) | 88.71% | 92.91% | **90.87%** |
| Avg engine score | 95.23 | 96.01 | **95.63** |
| Avg compile | — | — | **25.3 ms** |
| Identity-pair calibration (full 35) | — | — | **mean 97.13% / min 90.46%** |

> **2026-07-03: table layout + flex row width fixes** — flex rows now fill printable width (proportional to intrinsic mins); nested tables inherit parent cell width; borderless tables suppress visible gridlines. `borderless-table` **41.37 → 96.70**, `table-mismatched-cells` **77.65 → 96.12**, `simple-table-2x2` **83.91 → 95.82**, `simple-table-3col` **87.52 → 96.21**, `pre-code-block` **82.44 → 93.25**. Suite visual 92.58 → **95.57**, engine 94.19 → **95.63**; guards 35/35.
>
> **2026-07-03: two new suite cases** — `pre-code-block` (fenced `<pre><code>` + inline `<code>`) and `borderless-table` (label/value table with `border:none`).
>
> **2026-07-03: nested blockquote nesting fixed** — `nested-blockquotes-lists` **54.41 → 91.15**. `simple-blockquote` **92.09 → 96.61**.
>
> **2026-07-03: flex-column gaps + container inset fixed** — `flex-column-vertical` **72.18 → 97.74**.
>
> **2026-07-02: CSS bar divs in table cells now render** — `table-cell-bar-divs` **59.78 → 98.58**.

**Human-label cross-check** (blind ratings, `internal/research/human-labels.json`): visual means by rating are monotonic. Remaining human-rated weak spots: `flex-row-horizontal` 85.3 (**under-penalized** — cards taller, text wrapped). Fixed since labeling: `table-cell-bar-divs`, `flex-column-vertical`, `nested-blockquotes-lists`. New cases and post-fix `borderless-table` not yet re-labeled.

Tables below use the **layout-based visual** score; misaligned px is the raw pixel tripwire. Diff images: `output/suite/diff_{name}.png`. Full machine-readable output: `output/suite/results.json`.

---

## Standard baseline (17)

| Test | Description | XML | Visual | Misaligned px |
|------|-------------|-----|--------|---------------|
| `plain-paragraph` | Single unstyled `<p>` | ✓ | 96.79% | 986 |
| `multiple-paragraphs` | Three sequential paragraphs | ✓ | 96.77% | 3,005 |
| `heading-hierarchy` | h1 / h2 / h3 with body text | ✓ | 86.68% | 6,396 |
| `simple-unordered-list` | Basic `<ul>` with 3 items | ✓ | 96.49% | 744 |
| `simple-ordered-list` | Basic `<ol>` with 3 items | ✓ | 96.34% | 1,595 |
| `ordered-list-rich-inline` | `<ol>` with `<strong>` + highlighted `<span>` per item | ✓ | 97.28% | 4,192 |
| `paragraph-and-list` | Intro paragraph + `<ul>` | ✓ | 96.43% | 991 |
| `simple-link` | One hyperlinked anchor | ✓ | 96.66% | 837 |
| `multiple-links` | Two links in one sentence | ✓ | 96.71% | 1,077 |
| `basic-inline-formatting` | `<strong>`, `<em>`, nested bold-italic | ✓ | 96.94% | 981 |
| `pre-code-block` | Fenced `<pre><code>` + inline `<code>` | ✓ | 93.25% | 5,255 |
| `simple-table-2x2` | 2-column table, header + one row | ✓ | 95.82% | 597 |
| `simple-table-3col` | 3-column table, 3 rows | ✓ | 96.21% | 1,047 |
| `paragraph-with-line-break` | Address block with `<br>` tags | ✓ | 94.48% | 2,212 |
| `simple-blockquote` | Plain blockquote + paragraph | ✓ | 96.61% | 350 |
| `centered-paragraph` | `text-align: center` | ✓ | 96.73% | 552 |
| `horizontal-rule` | Content separated by `<hr>` | ✓ | 91.31% | 804 |

## Edge cases (18)

| Test | Description | XML | Visual | Misaligned px |
|------|-------------|-----|--------|---------------|
| `typography-colors` | Foreground/background colors, mixed inline & block | ✓ | 90.16% | 5,733 |
| `table-mismatched-cells` | Colspan, short rows, extra cells | ✓ | 96.12% | 1,341 |
| `borderless-table` | Label/value table with `border:none` | ✓ | 96.70% | 2,211 |
| `table-row-backgrounds` | Shaded `<tr>` bands | ✓ | 98.70% | 1,764 |
| `nested-blockquotes-lists` | Nested quotes, `<ol>` inside `<ul>` | ✓ | 91.15% | 3,939 |
| `inline-vs-block` | Spans, links, code, styled divs | ✓ | 97.90% | 13,596 |
| `inline-backgrounds` | Multi-color inline highlights, bold in shaded span | ✓ | 97.26% | 2,636 |
| `mixed-margins-paddings` | Asymmetric margin/padding, bordered box | ✓ | 94.17% | 4,749 |
| `flex-row-horizontal` | `display:flex; flex-direction:row` — three columns with gap | ✓ | 85.96% | 4,151 |
| `flex-column-vertical` | `display:flex; flex-direction:column` — stacked rows with gap | ✓ | 97.74% | 12,750 |
| `inline-svg-chart` | Inline SVG bar chart → native DOCX bands | ✓ | 96.81% | 6,342 |
| `table-cell-bar-divs` | CSS bar divs inside table cells | ✓ | 98.67% | 5,857 |
| `unicode-emoji-content` | Emoji in body text | ✓ | 95.14% | 3,581 |
| `image-block` | `data:` URL `<img>` in a centered paragraph | ✓ | 98.41% | 4,406 |
| `image-figure` | `<figure>` → `<img>` + `<figcaption>` | ✓ | 99.35% | 925 |
| `ordered-list-lower-alpha` | `<ol list-style-type:lower-alpha>` | ✓ | 96.65% | 1,893 |
| `ordered-list-upper-roman` | `<ol list-style-type:upper-roman>` | ✓ | 96.41% | 1,037 |
| `unordered-list-square` | `<ul list-style-type:square>` | ✓ | 96.32% | 1,575 |

---

## Lowest scores (current priorities)

Under layout-based scoring these align best with blind human ratings (1 = looks right, 2 = minor, 3 = broken):

| Test | Visual | Human | Notes |
|------|-------:|:-----:|-------|
| `flex-row-horizontal` | 85.96% | 3 | **Under-penalized** — cards taller, text wrapped (known metric limitation) |
| `heading-hierarchy` | 86.68% | 1 | Slightly compact vertical rhythm |
| `typography-colors` | 90.16% | 1 | Minor color/spacing deltas |
| `nested-blockquotes-lists` | 91.15% | 3 | Nesting fixed; pending re-label |
| `horizontal-rule` | 91.31% | 2 | Minor vertical height issues |
| `pre-code-block` | 93.25% | — | Multiline `<pre>` still imperfect; inline `<code>` OK |
| `mixed-margins-paddings` | 94.17% | 1 | Minor spacing deltas |
| `paragraph-with-line-break` | 94.48% | 1 | `<br>` spacing noise |

(Fixed since labeling: `table-cell-bar-divs` 59.78 → 98.67; `flex-column-vertical` 72.18 → 97.74; `nested-blockquotes-lists` 54.41 → 91.15. Fixed 2026-07-03 PM: `borderless-table` 41.37 → 96.70; `table-mismatched-cells` 77.65 → 96.12.)

---

## Related

- **OSS comparison** — run `npm run test:benchmark` after a loop; see [BENCHMARK.md](./BENCHMARK.md)
- **Style-source lanes** (inline vs computed) — [BENCHMARK.md](./BENCHMARK.md#style-source-inline-vs-computed-oracle-vs-computed-native-dom-docx)
- **Regenerate** — `npm run test:suite` (full) or `npm run test:suite:priority` (10-case subset)
