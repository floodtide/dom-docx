# Changelog

All notable changes to this project will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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

[0.1.3]: https://github.com/dom-docx/dom-docx/releases/tag/v0.1.3
[0.1.2]: https://github.com/dom-docx/dom-docx/releases/tag/v0.1.2
[0.1.1]: https://github.com/dom-docx/dom-docx/releases/tag/v0.1.1
[0.1.0]: https://github.com/dom-docx/dom-docx/releases/tag/v0.1.0
