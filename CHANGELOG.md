# Changelog

All notable changes to this project will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

### 1.0.3

- **A `<td>`/`<col>` with `border-width`, `min-width`, or `max-width` (but no `width`) could have its column sized from that unrelated property.** `explicitCellWidthTwips`/`colWidthTwips`'s raw-style regex fallback (used when the `width` CSS property parser found nothing) matched the substring `"width:"` wherever it occurred, including inside `border-width:`/`min-width:`/`max-width:` — pinning the column to that value's magnitude instead of sizing from content. The regex now requires `width` to start a declaration (`(?:^|;)\s*width\s*:`).
- **An explicitly zeroed border side (e.g. `border-right-width: 0`) was repainted by the generic `border` shorthand's fallback.** `buildBlockBorders` (divs/blockquotes), `tableBorderPlan` (table frames), and `cellStyleBorders` (table cells) all resolved a side as `css.borderX ?? css.border` — since a zeroed side resolves to the same `undefined` a never-declared one would, all three fell back to painting it with the generic border anyway. `ParsedCss` now tracks which sides got their own explicit declaration (`explicitBorderSides`), and a shared `resolveBorderSide` helper (used by all three call sites) only falls back to `border` for sides with no declaration of their own.
- **`border: 0` / `border-right: 0` (no unit, or any non-`px` unit like `0pt`/`0in`) rendered a visible 1px border instead of none.** `parseBorderShorthand` only recognized a width immediately followed by `px`, so any other zero-length token fell through to the shorthand's "no width token found" default of `1`. It now tokenizes the shorthand and recognizes a length in any of `px`/`pt`/`pc`/`mm`/`cm`/`in`, or a bare `0`, at any position among the width/style/color components (`2px solid red`, `solid 2px red`, `red 2px solid` all work) — a `0` color channel inside `rgba()`/`rgb()` can't be mistaken for the width, since that token never looks like a bare number in the first place.
- **Word fields (`data-docx-field`, `{page}`/`{pages}` sugar) inside a `<table>` cell were silently dropped.** `convertTable` and every function it calls to build cell content (`cellParagraph`, `cellBlockParagraph`, `cellBlocks`, `buildTableCell`, `buildTableRows`) never received the visitor's `fieldOptions`, so `collectInlineRunsFromNodes` always fell back to the disabled default inside a cell — silently discarding the field marker instead of emitting a field, with no warning either (the default `fieldOptions` has no `onWarning` wired up). This broke any page-number table layout (e.g. a footer table with a logo cell and a page-number cell) in `headerHtml`/`footerHtml`. `fieldOptions` is now threaded through all of them.

### Added

- **Guard coverage for the four fixes above.** `guard:border-width` gained checks for the explicit-zero-vs-generic-border-fallback fix and the zero/non-px-unit fixes; `guard:table-width-units` gained a check for the width-regex boundary fix; `guard:fields` gained 5 checks for fields inside table cells (marker and `{page}`/`{pages}` sugar, both inline cell content and a `<p>` inside a cell).
- **Six visual regression cases** (`table-cell-width-vs-border-width`, `table-cell-explicit-zero-border-side`, `table-frame-explicit-zero-border-side`, `div-explicit-zero-border-side`, `border-shorthand-unitless-zero`, `border-shorthand-non-px-unit-zero`) covering each fix's rendered output end-to-end, not just the parsed values.

## 1.0.2

### Added

- **`border-width` shorthand and per-side `*-width` longhands.** `parseInlineStyle` had no case for `border-width`, `border-top-width`, `border-right-width`, `border-bottom-width`, or `border-left-width`, so those declarations were silently dropped. Supports keyword widths (`thin`/`medium`/`thick`) and numeric widths, expanding the 1-, 2-, 3- and 4-value shorthand forms in CSS top/right/bottom/left order. `border-width: 0` leaves borders undefined, matching the existing "0 means no border" convention used by `parseBorderShorthand` and `computedBorderSide`.
- **`border-style` shorthand and per-side `*-style` longhands apply the CSS UA default width.** A browser renders `border-style: solid` (with no width declared) as a `medium` (3px) border on every side — computed styles already fold this default in, but the inline-style parser had no cascade to fall back on, so `border-style` alone (or mixed with a width on only some sides, e.g. `border-top-width: thick; border-style: solid`) produced borders on some sides and none on others. `border-style`/`border-{top,right,bottom,left}-style` now fill in a `medium` width for any side that doesn't already have one from `border`/`border-width`/a `*-width` longhand.
- **`border-width` guard.** `npm run guard:border-width` covers uniform and per-side shorthand expansion, keyword widths, longhand-only-sets-its-own-side, the zero-width convention, the `border-color` fallback and the `border-style` default-width behavior below. Added to `guard:ci`.

### Fixed

- **Standalone `border-color` was ignored on block-level borders (`<div>`, `<blockquote>`, etc.).** `border-color: <color>` declared apart from the `border`/`border-{side}` shorthand only ever reached table and cell borders; block borders always rendered black regardless of an explicit `border-color`. `borderSideToDocx` now falls back to `css.borderColor` the same way the table border builders already do, while a color embedded directly in the `border`/`border-{side}` shorthand still takes precedence.
- **`border-width: 1px 0px` (or any multi-value shorthand with a `0` component) dropped the entire declaration.** `parseBorderWidth` returned `undefined` for a `0` token (its "no border" convention), so `applyBorderWidthShorthand`'s "bail if any part is undefined" check treated a legitimate `0` side the same as an invalid one — the whole declaration, including the non-zero sides, was silently discarded. Width parsing and "does this produce a border" are now separate steps, so a `0` component only clears that one side.
- **`border-width`/`border-*-width` silently dropped a color already declared via `border`/`border-top`/etc.** Both always wrote a bare `{ widthPx }` with no color, unconditionally overwriting a side that already carried a color — the border rendered black instead of the declared color, regardless of which property came first in the style string. Both now preserve the existing side's (or the generic `border` shorthand's) color when applying a width-only update, matching how `border-width` only touches the width component in real CSS.
- **An explicit `0` width was overridden by the `border-style` medium-width default.** After the fix above, a side set to `0` (e.g. `border-width: 3px 0px`) correctly resolves to "no border" — but that made it indistinguishable from "no width declared at all" to `applyBorderStyleDefaults`, so a `border-style: solid` on the same element re-added a `medium` border on the side the author explicitly zeroed out. Explicitly-declared widths (including `0`) are now tracked separately from the resulting value, so the `border-style` default only fills in sides that truly had no width declaration.

## 1.0.1

No converter changes. Docs only.

### Changed

- **Capability section in `README.md` is now versioned `v1.x`.** The "Supported / Not supported" section was still headed `v0.1.x` when 1.0.0 shipped, so the npm package page described a 1.0.0 release in pre-1.0 terms. The headings now read `v1.x` rather than a specific patch, so they stay accurate across the 1.x line.
- **Release examples in `CONTRIBUTING.md` use post-1.0 version numbers.** The tagging walkthrough still used `v0.1.3` as its placeholder.

## 1.0.0

### Fixed

- **Bookmark names no longer exceed the OOXML 40-character limit.** `w:bookmarkStart/@w:name` is schema-capped at 40 characters, but element ids were stamped verbatim, so real documentation pages produced schema-invalid files (a Red Hat storage page emitted 71 such errors from ids like `deleting-a-file-system-from-a-stratis-pool-by-using-the-web-console`). Long ids are now truncated to 40 with a hash suffix computed from the full id. The suffix is a pure function of the id, so `href="#long-id"` and the `id` target independently normalize to the same name and the jump still resolves, and two ids sharing a long prefix stay distinct. Length is counted in code points, so non-ASCII and astral ids are not split mid-character. Ids of 40 characters or fewer are untouched.

### Added

- **Bookmark-length guard.** `npm run guard:bookmark-length` covers the truncation boundary, determinism, prefix collisions, percent-encoded fragments, astral characters, and end-to-end OOXML validity plus anchor/bookmark agreement. Added to `guard:ci`.

## 0.1.22

No converter changes. Packaging, discoverability and test coverage only.

### Added

- **`AGENTS.md` now ships in the published package.** The HTML authoring guide for AI agents was previously repo-only, so anything reading `node_modules/dom-docx` could not find it. Covers which constructs convert well, which to avoid, and copyable document shapes.

- **Header and footer image guard.** `npm run guard:chrome-image` asserts that `data:` images passed via `headerHtml` / `footerHtml` reach the generated `word/header*.xml` / `word/footer*.xml` as real drawings with their bytes in `word/media/`, and that an image used in both is stored once rather than twice. Added to `guard:ci`.

- **Cell-level width coverage in `guard:table-width-units`.** Now covers `style="width:…px"` on `<th>` / `<td>` with no `<colgroup>`, asserting both the absolute twips and that the ratio between columns survives instead of being evenly distributed. Prompted by privateOmega/html-to-docx#266, where both behaviours are reported broken.

### Changed

- **npm keywords now include `html-to-docx` and `html to docx`.** Exact-phrase keywords place the package in the narrow keyword pool people actually search, alongside the established libraries, rather than only the generic `html` and `docx` pools.

## 0.1.21

### Fixed

- **Bordered/shaded `<div>` blocks now respect `width: 50%` (and other percentage/explicit widths).** Wrapper tables were always full page width; CSS width fields are now carried through `BlockLayout` and resolved against the printable content width. Also fixes padding being discarded, horizontal margin not insetting content, and line-box height on shaded/bordered cells. Suite case: `bordered-shaded-div-width-percent`. (Thanks to Alexander Wilms.)

## 0.1.20

Update package name to include **docx** in title for better discovery.

## 0.1.19

### Added

- **Mixed portrait/landscape sections from CSS.** Top-level `style="page:landscape|portrait|Name"`, `@page { size: … }` orientation inference, and inline named-page references work on the default inline path. Class→page mappings (`div.WordSection2 { page: … }`) require `styleSource: "computed"`. Explicit `documentConfig.orientation` still forces a single-orientation document. Guard: `npm run guard:mixed-orientation`. (Extends section work by Alexander Wilms.)

### Fixed

- **Blank first page from multi-section OOXML prefix.** Multi-section output could start with an empty paragraph plus a section-break-only paragraph; Word rendered that as a blank page 1. Post-pack patching strips exactly that leading prefix (`patchLeadingBlankSectionPrefix`).

## 0.1.18

### Added

- **Allowlisted Word fields in page chrome.** `headerHtml`, `footerHtml`, `coverHtml`, and `tocHtml` support `<span data-docx-field="page|pages|section-pages|section">` markers (case-insensitive) that emit native PAGE / NUMPAGES / SECTIONPAGES / SECTION fields with styled runs. `{page}` and `{pages}` sugar in chrome HTML and the `pageNumber: boolean | string` option lower to the same markers. Unknown field names warn and drop; body content cannot use fields in v1. Guard: `npm run guard:fields` (writes sample DOCX to `output/guards/fields/`). (Extends field-token work by Alexander Wilms.)

### Fixed

- **Computed-path `lineHeight` parity between Node and the browser bundle.** The Playwright snapshot script (`computed-style-snapshot.browser.js`) now reads `lineHeight` like the bundled snapshot, and UA-derived heading line-height is cleared when UA `fontSize` is stripped — so Node computed-native and `dist/browser/` emit the same `w:spacing/@w:line` twips. Caught by `guard:browser-parity` on `heading-hierarchy`.

- **Chrome field tokens no longer dropped on paragraph flush.** Footer/header field spans passed `fieldOptions` through block visitors but not the paragraph `flush()` path, so `{page}` / `data-docx-field` markers in chrome HTML could silently vanish.

### Changed

- **`score:suite:strict` compares pixel tripwire counts against the local baseline** (zero tolerance for regression), not against zero misaligned pixels — matching how the suite baseline diff is meant to be read.

## 0.1.17

### Added

- **CSS `line-height` on block elements → paragraph line spacing.** Unitless multipliers (`1`, `1.15`, `1.5`, `2`), percentages, and absolute lengths (`px`, `pt`, `em`) are parsed on both the inline and computed style paths and emitted as `AT_LEAST` `w:spacing/@w:line` twips sized to the paragraph font. When omitted, the default remains 1.4× (matching the HTML harness). Suite case: `line-height-presets`.

### Fixed

- **Unstyled headings no longer render in Word's theme blue.** `<h1>`–`<h6>` without an explicit CSS `color` mapped to Word Heading 1–6 styles, which carry a default theme blue (`#2E74B5`) that browsers never show — the inline path never sees inherited body `color`. Headings with no author color now get an explicit near-black run color (`#111`, matching the harness body) while keeping the Heading style for outline levels and TOC bookmarks. Explicit heading colors and computed-path inherited colors (including light text on dark banners) are unchanged. Suite cases: `heading-hierarchy`, `line-height-presets`.

- **Flex card images: ghost whitespace and short bordered boxes.** Pretty-printed HTML whitespace around block children in flex cards no longer flushes as empty EXACT-line paragraphs (a visible band above/below chart images). Chart mount divs (`height:300px` wrapper around an `<img>`) now size the flex row from the mount height and emit an EXACT spacer line below the image so the bordered card matches the browser box instead of `min-height` alone with the image sitting on a short line. Drawing paragraphs skip the AT_LEAST vertical-centering patch so tall image lines stay top-aligned. Suite case: `flex-row-images` (93.7% → 96.8%).

## 0.1.16

### Added

- **CSS cascade regression case `stylesheet-hero-banner`.** Minimal dark hero banner repro (descendant `h1` color + kicker `text-transform: uppercase`) with OOXML structural checks — catches computed-path gaps that visual scoring alone can miss. Run via `npm run score:css-cascade`.

### Fixed

- **Computed path: stylesheet `text-transform: uppercase` now emits `w:caps`.** `getComputedStyle` snapshots now include `textTransform`, so class rules like `.hero-kicker { text-transform: uppercase }` render as all-caps in Word instead of preserving source casing (`Product launch` → `PRODUCT LAUNCH`). Inline `style="text-transform:…"` was already handled. CSS cascade case: `stylesheet-hero-banner`.

- **Computed path: light text on a dark ancestor block is no longer dropped.** Document-canvas remapping stripped near-white foreground when the element itself had no dark `backgroundColor` — fine for dark-mode browser tabs, but wrong for hero banners where the fill lives on a parent (e.g. `.hero { background: #1a1a2e }` with `.hero h1 { color: #fff }`). White headings inside dark containers now keep their color instead of falling back to the default Heading1 blue. CSS cascade case: `stylesheet-hero-banner`; showcase: `product-launch-brief`.

## 0.1.15

### Added

- **Vertical table cell text via CSS `writing-mode`.** `writing-mode: vertical-rl` / `vertical-lr` / `sideways-rl` on a `<td>`/`<th>` (or inherited from its `<tr>`) becomes OOXML `w:textDirection` `tbRl` (text rotated 90° clockwise); `sideways-lr` becomes `btLr` (90° counter-clockwise) — the classic narrow vertical header column. Vertical cells also stop content-weighting their column by label length and weigh in at one line box wide, since the label grows the row height instead. Works on both the inline and computed style paths. `text-orientation: upright` (stacked upright glyphs) has no OOXML equivalent and keeps the cell horizontal. Guard: `npm run guard:vertical-text`. (Thanks to Alexander Wilms for a community patch.)

### Fixed

- **Vertical table labels now size and center like browsers.** Rows with `writing-mode` get an `ATLEAST` row height from the rotated label length, and centered `<th>` headers get `w:vAlign center` on the cell — Word/LibreOffice no longer squashes or left-aligns vertical header text. Suite case: `table-vertical-text`. Integration pass on the community `writing-mode` patch above.

- **Explicit bold/italic cancellation via `font-weight:normal` and `font-style:normal`.** Inline spans that reset weight or style inside an inherited bold or italic context now emit `w:b` / `w:i` with `val="false"` instead of silently inheriting the parent run. Also covers `text-transform:none` → `w:caps val="false"` and `text-decoration:none` → `w:u val="none"` (including inside `<td>` cells). Underline cancellation avoids a standalone underlined space-only run after a cancelled span (LibreOffice PDF export painted through it); the `basic-inline-formatting` suite separates caps and underline lines with `<br>` so LO PDF matches the reference. Covered in the `basic-inline-formatting` suite case. (Thanks to Alexander Wilms for a community patch.)

- **Whitespace-only inline spans preserve their space.** A `<span> </span>` between two siblings no longer drops its lone space (needed for `{page}` / `of {pages}`-style footer tokens). Covered in the `basic-inline-formatting` suite case. (Thanks to Alexander Wilms for a community patch.)

- **`vertical-align: super/sub` and `<sup>`/`<sub>` → superscript/subscript runs.** CSS `vertical-align:super` / `vertical-align:sub` and HTML `<sup>`/`<sub>` on inline spans emit raised/lowered runs with explicit `w:sz` and `w:position` (LibreOffice PDF export shrinks text again when `w:vertAlign` is combined with an explicit size, so position is used for visual fidelity). `<sup>`/`<sub>` without an explicit font size use the browser UA default (~83% of the parent). Paragraphs that mix super and sub on one line get a taller `AT_LEAST` line box to match the browser’s expanded line height. Suite case: `vertical-align-super-sub`. (Thanks to Alexander Wilms for a community patch.)

- **Physical CSS length units (`pt`, `pc`, `mm`, `cm`, `in`) now work in table cell and column widths.** `<col style="width:72pt">`, `<col width="1in">`, and `<td width="2cm">` previously fell through to the pixel branch, so `72pt` was read as `72px` (25% too narrow) and `2cm` as `2px` (collapsed to a sliver). All five units now convert to the correct twip widths, in both the `style="width:…"` and legacy `width=""` attribute paths; unitless attribute values still mean pixels and `%` still resolves against the table content width. Suite case: `table-physical-unit-widths`. Guard: `npm run guard:table-width-units`. (Thanks to Alexander Wilms for a community patch.)

## 0.1.14

### Fixed

- **Table rows whose cells hold only invisible-but-real content are no longer squashed.** The spacer-row collapse (which keeps truly empty divider rows from inflating to a full line box) also fired on cells containing `&nbsp;`, zero-width space, soft hyphen, `<br>`, or `<wbr>` — browsers keep a full-height line box for all of these. Such cells now count as intentional content and the row gets its natural height; genuinely whitespace-only rows still collapse. Also covers typographic spaces (`&ensp;`, `&emsp;`, `&thinsp;`), which JS `\s` matches but browsers render at full width. Suite case: `table-empty-cell-row-height`. (Thanks to Alexander Wilms for a community patch.)

## 0.1.13

### Changed

- **Default text color now uses Word's `auto` instead of a forced near-black.** Text with no explicit CSS color previously had `#111111` stamped on every run; it now omits the run color so Word/LibreOffice apply their default (which renders black, and adapts to the background). This is more native and fixes a latent bug: a dark-background block whose text had no explicit color rendered dark-on-dark (invisible) — `auto` renders it light-on-dark. Hyperlinks keep their link color. (Thanks to Alexander Wilms for a community patch.)

### Fixed

- **CSS `padding` on a table cell is now applied.** Previously only the table's `cellpadding` attribute set cell margins, so `<td style="padding:16px">` produced no `w:tcMar` and rendered flush. Per-side CSS padding on a `<td>`/`<th>` now becomes cell margins, with the table `cellpadding` attribute filling any side the cell doesn't set. Suite case: `table-cell-padding`. (From a community patch.)
- **Physical CSS length units (`mm`, `cm`, `in`, `pc`) are now parsed correctly.** They previously fell through to the bare-number branch and were treated as pixels, so `10mm` came out as `10px` (~2.6mm — about 3.85× too small); `in`/`pc` had the same silent mis-parse. All four now convert to the correct twip lengths (exact factors: 1440 twips/inch, 25.4mm/inch), in both the inline and computed length parsers. Suite case: `css-length-units`. (From a community patch.)

## 0.1.12

Add Related Projects section to README.

## 0.1.11

### Fixed

- **`<th>` header cells are centered by default, matching browsers.** Chromium/Firefox apply the UA default `th { text-align: center }`; dom-docx left header text left-aligned unless an explicit `text-align`/`align` was present, so plain `<th>` headers sat visibly off from the browser render (the `adjacent-tables` suite case scored H 74 from this alone — 85.4% → 96.1% after the fix). An explicit alignment still wins.
- **Suite oracle: hidden/overlay content is excluded from expected text regardless of how it hides.** The text-fidelity oracle only stripped hidden elements carrying a `style` attribute, so content hidden via overlay semantics (`role="tooltip"`, closed `<dialog>`, `-dialog`/`-tooltip` components) stayed in the EXPECTED text and the converter was penalized for correctly skipping it (`tooltip-skipped` 86.6% → 96.3%). All 42 suite cases now score ≥ 90% (avg 96.3%).

## 0.1.10

### Fixed

- **Adjacent tables no longer merge (data tables collapsed to sliver width).** Word and LibreOffice fuse consecutive sibling `w:tbl` elements into ONE table, so any table emitted directly after another inherited a merged grid — on a real docs page an empty 0.4"-wide icon-chrome table followed every data table, and the merge collapsed each data table to a ~1-character-wide column. Two fixes: an invisible 1-twip separator paragraph is inserted between consecutive tables so each keeps its own grid, and flex containers whose items have no visible content (no text, media, fill, or border — e.g. icon-only web-component chrome whose glyph lives in shadow DOM) no longer emit an empty table at all. Suite case: `adjacent-tables`.
- **Images no longer smash against the next heading or paragraph.** Web layouts separate figures with margins the computed path faithfully zeroes (flex/grid `gap`, container padding), so a docs figure rendered flush against the following heading or body text in the flat docx. An image paragraph's before/after spacing is now floored to ~0.5em (a larger real margin still wins); skipped for flex-card content, which manages its own tight rhythm. Guard: `npm run guard:image-spacing` (structural — the floor deliberately diverges from a bare `margin:0` browser render, so it can't be scored by the visual suite).
- **Transient overlay content (dialogs, tooltips, popovers) is no longer rendered.** Overlay content shown only on a user action is not part of the linear document, yet two kinds leaked in: a figure's click-to-expand modal held a full-size **duplicate** of the same image (two `<img>`, both emitted), and a heading's copy-link **tooltip** bled its label into the text (headings ended in "Copy link"). Native `<dialog>` without `open`, overlay web components matched by the `-dialog`/`-modal`/`-tooltip`/`-popover` custom-element suffix (`<rh-dialog>`, `<rh-tooltip>`, `<sl-popover>`), and `role="dialog"`/`role="alertdialog"`/`role="tooltip"`/`aria-modal="true"` are now skipped. Suite cases: `modal-dialog-skipped`, `tooltip-skipped`.

## 0.1.8

### Fixed

- **Admonition / alert callouts render as a box instead of plain text.** Docs sites mark notes up as web-component alerts (`<rh-alert>`) or `class="admonition note"` blocks whose box (fill, accent bar, icon) is drawn in shadow DOM or an external stylesheet — the light-DOM host reads as transparent, so a "Note" flattened to plain text. Callout containers (recognized by alert tag or `note`/`tip`/`important`/`warning`/`caution`/`danger`/`admonition`/`callout`/`alert` class token) now get a shaded box with a severity-colored left accent bar (amber for warning/caution, red for danger/important, green for tip, blue for note), and the title label ("Note") is bolded. A callout that already carries a real background keeps it. Suite case: `admonition-note`.
- **Table column widths from `<colgroup>` are now honored.** Tables that size their columns entirely through `<colgroup><col style="width:N%">` (common on docs sites and DocBook/AsciiDoc output) carried no width signal dom-docx recognized, so every column collapsed to its min-content width — a real docs table rendered as a single ~1-character-wide column. `<col>` widths (percent or px, with `span`) now seed the per-column widths and the table's natural width, so a colgroup-sized table fills the page with the declared proportions. Suite case: `table-colgroup-widths`.
- **Computed styles no longer follow dark-mode browser themes into Word.** A DOCX is a light canvas (white page, dark text). Snapshotting `getComputedStyle` from a tab with `prefers-color-scheme: dark` stamped near-white text colors with no fill — invisible in Word/LibreOffice (seen converting Red Hat docs from a dark macOS browser). The Node/Playwright computed path now forces `colorScheme: "light"` for the snapshot; both paths drop near-white text colors when there is no dark block background (light text on an intentionally dark shaded callout is kept). Guard: `npm run guard:document-canvas`.
- **Empty flex containers no longer render as solid colored boxes.** On the computed path, docs sites wrap figures in a `display:flex` "open in modal" control with a background color and hidden/lazy inner content; when every flex item was hidden, the container still emitted an empty flex table painted with its background — a bare colored box (the "blue box" seen converting a Red Hat docs page, where all five figure wrappers rendered this way). A flex container with no visible items now renders nothing. Flex-item visibility is also resolved with the active style source, so computed `display:none` items are filtered correctly. Separately, a `background-color` on a media-only container (an `<img>`/`<svg>`/`<canvas>`/`<picture>` wrapper with no text) is dropped so the image stands on its own; backgrounds on containers with real text (callouts, blockquotes) are unaffected.
- **Images with `display: inline-block` (or `block`) are no longer silently dropped.** On the computed path, docs sites style images (e.g. a `modal-img` thumbnail) as `inline-block`, which made `isBlockElement` route the `<img>` to the block-container dispatch — which has no image handling — so the element vanished with no drawing and no alt text (every figure on a Red Hat docs page: 10 images resolved, 0 rendered). `<img>`/`<picture>` are now always treated as replaced inline media and rendered via the inline-run path regardless of computed `display`.
- **Oversized images are clamped to the page width.** An `<img>` with no `width`/`height` attributes was emitted at its full natural pixel size, so a high-resolution image (e.g. a 1520px docs diagram) rendered ~16" wide — overflowing the margins, clipping its right edge, and spilling across pages. Display size is now capped at the printable content width (aspect-preserved), like a browser's `max-width: 100%`. Images already sized at or below the content width are unaffected.
- **Flex cards no longer clip wrapping content.** A `display:flex` container sizes each card row from an estimate of one line per block child; that estimate was applied as an EXACT row height, so any content taller than the estimate was cropped — a long heading inside a flex wrapper (e.g. a docs page's `.titlepage`) wrapped to a second line and had that line sliced off in LibreOffice. Flex card rows now use AT_LEAST height: they still floor at the estimate (so tight single-line cards don't inflate) but grow to fit wrapping/nested content. The `flex-row-horizontal` visual suite case now uses multi-line wrapping content as a regression guard.

### Added

- **`npm run guard:document-canvas`** — regression for light-canvas color handling: near-white computed text with no dark fill must not be stamped into OOXML; light text on a dark shaded block is kept; optional Playwright check that the Node computed path forces `prefers-color-scheme: light`.
- **`onWarning`** — diagnostic callback for conditions that don't fail conversion but silently degrade the output: images with no `imageResolver` (or that it couldn't resolve) fall back to alt text, and class/stylesheet-based CSS is ignored on the default `styleSource: "inline"`. Previously both failed silently — a real-world page (external stylesheet, hosted images) would convert "successfully" while quietly losing every image and all table/callout styling. Defaults to `console.warn`; pass `null` to suppress. Available on both the Node and browser entries.

## [0.1.6] - 2026-07-12

### Added

- **`tocHtml`** — caller-provided table-of-contents "slot": an HTML fragment placed after the cover page (if any) and before the body. You control the markup and styling (numbered, boxed, columns…); in-page links (`<a href="#id">`) jump to the matching `id` in the body. Add a trailing `<div style="break-after:page"></div>` to put it on its own page. Guard: `npm run guard:toc-slot`.
- **Internal links (`href="#id"`)** — same-document fragments become Word internal hyperlinks (`w:hyperlink w:anchor`) targeting bookmarks emitted for matching `id` attributes (and legacy `<a name>`). External URLs unchanged. Guard: `npm run guard:internal-href`.

### Removed

- **`tableOfContents`** (breaking) — the auto-generated, page-number-less TOC field added in 0.1.5 is removed in favor of `tocHtml` + internal links. Rather than dom-docx generating and styling the TOC, you provide the exact TOC markup and it wires up the `#id` navigation — full styling control, no field, no "update fields" prompt, nothing to keep in sync. (`TableOfContentsConfig` type and `guard:toc` removed.)

### Fixed

- **Headings no longer smash into the block above them.** Web layouts routinely zero heading margins and rely on flex/grid `gap` or container padding for spacing — which has no equivalent in a flat docx, so on the computed path a `margin-top: 0` heading rendered flush against the previous paragraph or table. Heading top spacing is now floored to ~0.5em of the heading font (a larger real margin still wins; the floor is skipped inside flex cards).

## [0.1.5] - 2026-07-10

### Added

- **`coverHtml`** — HTML fragment rendered as a cover page: the first content in the document, before the table of contents, followed by an automatic page break. Inline styles + `data:` images (e.g. a logo); header/footer/page number are suppressed on the cover page, and headings inside the cover are not treated as TOC entries.

### Changed

- **`tableOfContents` is now a clickable, page-number-less table of contents** (reworked from the page-numbered field shipped in 0.1.4). Each entry hyperlinks to a bookmark on its heading; page numbers are omitted — they depend on layout the library does not compute — so the entry list is **complete at creation**: correct in every viewer (Word, LibreOffice, Google Docs, PDF/preview) with **no field update and no "update fields" prompt**. Entries are styled as a document outline for readability — bold near-black top levels, lighter/greyer deeper levels, indent + spacing per level — rather than a wall of blue underlined links (they stay clickable). The field carries the `\n` switch so a reader who refreshes it still gets a number-less TOC, and heading styles keep their `w:outlineLvl` so that refresh rebuilds correctly in LibreOffice.

### Fixed

- **Flex row of bordered cards wrapping an `<img>`** rendered wrong in LibreOffice: a doubled border (the item was emitted both as the flex cell _and_ as a nested bordered table), the top of the image clipped (an EXACT line box cropped the inline image above the baseline), and `min-height` ignored (the card hugged the image). Flex items now render their children into the single bordered cell; image lines use AT_LEAST height so they aren't cropped; `min-height` is parsed and applied as an AT_LEAST row height; and card content is top-aligned like the browser. (`flex-row-images` visual 51.6% → 93.7%; full-suite score unchanged.)

## [0.1.4] - 2026-07-10

### Added

- **`tableOfContents`** — insert a native Word Table of Contents field built from the document's `h1`–`h6` (mapped to Word Heading 1–6). `true` for defaults, or `{ title?, headingRange?, hyperlink?, pageBreakAfter? }`. Heading titles are cached into the field so it is visible immediately; page numbers are filled by the word processor on field update (Word updates on open via the dirty/`updateFields` flags). Heading styles get explicit `w:outlineLvl` so LibreOffice's "Update Table of Contents" repopulates instead of emptying the table. _(Reworked to a clickable, page-number-less TOC in Unreleased — see above.)_
- **`npm run guard:toc`** — structural regression for the TOC field, cached entries, heading outline levels, and OOXML schema validity (CI, no Playwright/LibreOffice)

### Changed

- The Node and browser entries now forward the whole options object to the builder (which reads only the `DocumentConfig` fields), so a new option reaches both entries automatically — replacing the two hand-maintained per-entry option lists that could silently drift
- **`guard:config`** runs its option → OOXML assertions through **both** the Node (`convertHtmlToDocx`) and browser (`convertHtmlToDocxUint8Array`) entries, so per-entry forwarding drift fails in CI
- Browser entry types (`dist/browser.d.ts`) are generated by tsc from `src/browser.ts` instead of a hand-maintained declaration file, so the published `dom-docx/browser` types can't fall out of sync with the code

## [0.1.3] - 2026-07-09

### Added

- **`rasterizeInPlace`** — rasterize live `<canvas>` and complex `<svg>` (e.g. chart libraries) to PNG `<img>` before conversion, on both the browser bundle and the Node Playwright path
- **`rasterizeInPlace.scale`** — optional supersampling factor (default `1`, max `4`); `scale: 2` recommended for sharper chart PNGs in Word
- Page breaks are **CSS-only** — use `break-before` / `break-after` (inline or via computed stylesheets); no special class names
- **`options.root`** on the browser API — pass the live export element when using `styleSource: "computed"` from an SPA so computed styles resolve against the correct subtree
- **`npm run guard:page-break`** — structural regression (OOXML + multi-page PDF via LibreOffice; not part of the single-page visual suite)

### Fixed

- **SPA computed-style export** — style snapshots are scoped to the export root with inline-style fallback when computed values are unavailable
- **Flex layout + rasterized charts** — flex row/column sizing and paragraph line spacing now account for rasterized `<img>` dimensions so chart images are not clipped
- **Visual scoring** — rasterized text inside SVGs (e.g. chart labels) is no longer incorrectly penalized by the fidelity metric

### Changed

- Test/score npm scripts reorganized into **`score:*`**, **`guard:*`**, and **`research:*`** tiers; hardcoded suite case counts removed from docs
- **`npm run docs:sync`** — regenerate scoring docs from harness JSON
- README, API.md, AGENTS.md, CONTRIBUTING.md, and BENCHMARK.md refreshed (browser quick start, `rasterizeInPlace`, page breaks, dom-docx.com links)

## [0.1.1] - 2026-07-05

### Fixed

- Shaded callouts and blockquotes no longer lose their accent bar or background fill on the computed-style path
- Computed-style row-height leak that could inflate paragraph spacing in table rows

### Changed

- API.md and TEST-SCORES documentation updates

## [0.1.2] - 2026-07-05

### Fixed

- **`dom-docx/browser` npm exports** — bundlers now resolve the ESM entry correctly; the IIFE bundle is included in the published tarball

## [0.1.0] - 2026-07-02

### Added

- `convertHtmlToDocx()` — HTML body fragment → native OOXML (paragraphs, runs, lists, tables, images)
- Default **`inline`** style path (pure JS: `docx` + `cheerio` + `fflate`, no browser)
- Optional **`computed`** style path via Playwright `getComputedStyle` (optional dependency)
- Browser bundle entry (`dom-docx/browser`) for in-page conversion
- Page options: size, orientation, margins, default font, metadata, headers/footers, page numbers, lang/direction
- `list-style-type` support for ordered and unordered lists
- `data:` URL image embedding with optional `imageResolver` hook
- Low-complexity inline SVG → native DOCX bands
- Committed [examples/](./examples/) with sample HTML, DOCX, and side-by-side previews
- Visual regression harness in `tools/` (33-case loop, OSS benchmark, scoring methodology)

[0.1.6]: https://github.com/floodtide/dom-docx/releases/tag/v0.1.6
[0.1.5]: https://github.com/floodtide/dom-docx/releases/tag/v0.1.5
[0.1.4]: https://github.com/floodtide/dom-docx/releases/tag/v0.1.4
[0.1.3]: https://github.com/floodtide/dom-docx/releases/tag/v0.1.3
[0.1.2]: https://github.com/floodtide/dom-docx/releases/tag/v0.1.2
[0.1.1]: https://github.com/floodtide/dom-docx/releases/tag/v0.1.1
[0.1.0]: https://github.com/floodtide/dom-docx/releases/tag/v0.1.0
