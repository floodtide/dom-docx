# Changelog

All notable changes to this project will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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

[0.1.0]: https://github.com/dom-docx/dom-docx/releases/tag/v0.1.0
