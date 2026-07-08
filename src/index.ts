/**
 * dom-docx — public entry point (Node).
 *
 * Converts a semantic HTML body fragment to a native Word `.docx` (paragraphs, runs,
 * lists, tables, images) — not a rasterized snapshot. The default `inline` path is pure
 * JS (docx + cheerio + fflate) and requires no browser. The optional `computed` style
 * source lazy-loads Playwright only when used, so it is not needed to install or run the
 * inline converter.
 *
 * For in-browser conversion (returns a `Blob`), import the browser entry — see
 * `package.json` `exports` (`browser` condition) / `src/browser.ts`.
 */
export { convertHtmlToDocx, buildDocxBuffer, buildDocxUint8Array, buildDocxBlob } from "./converter.js";
export type {
  ConvertOptions,
  DocumentConfig,
  StyleSource,
  StyleResolver,
  ImageResolver,
  ResolvedImage,
} from "./converter.js";
export { INLINE_STYLE_RESOLVER, ComputedStyleResolver } from "./converter/style-resolver.js";
export {
  snapshotComputedStyles,
  createComputedStyleResolver,
  computedStyleResolverFromPage,
  preparePlaywrightRasterizedExport,
  openPlaywrightPage,
} from "./converter/style-resolver-node.js";
export type { PlaywrightPreparedExport } from "./converter/style-resolver-node.js";
export type { RasterizeInPlaceOptions } from "./converter/rasterize-subtree.browser.js";
