import type { Browser, Page } from "playwright";
import { buildDocxUint8Array } from "./converter/build-docx.js";
import {
  INLINE_STYLE_RESOLVER,
  type StyleResolver,
  type StyleSource,
} from "./converter/style-resolver.js";
import {
  computedStyleResolverFromPage,
  openPlaywrightPage,
  preparePlaywrightRasterizedExport,
} from "./converter/style-resolver-node.js";
import type { ImageResolver, ResolvedImage } from "./converter/image.js";
import type { DocumentConfig } from "./converter/build-docx.js";
import type { RasterizeInPlaceOptions } from "./converter/rasterize-subtree.browser.js";

export type { StyleResolver, StyleSource } from "./converter/style-resolver.js";
export type { ImageResolver, ResolvedImage } from "./converter/image.js";
export type { DocumentConfig } from "./converter/build-docx.js";
export type { RasterizeInPlaceOptions } from "./converter/rasterize-subtree.browser.js";
export { buildDocxUint8Array, buildDocxBlob } from "./converter/build-docx.js";

export interface ConvertOptions extends DocumentConfig {
  styleSource?: StyleSource;
  /** Reuse an open Playwright browser for computed style resolution (benchmark loops). */
  browser?: Browser;
  /**
   * Browser-native computed styles: read from this already-rendered page's ambient DOM
   * instead of spawning a fresh page. Used when `styleSource: "computed"` or
   * `rasterizeInPlace` needs a live Chromium context.
   */
  page?: Page;
  /**
   * CSS selector for the export root when converting `element.innerHTML` from a live page
   * (must match the node whose innerHTML was passed as `html`). Playwright `page` path only.
   */
  rootSelector?: string;
  /**
   * Rasterize `<canvas>` and complex `<svg>` (e.g. Highcharts) under the export root to PNG
   * `<img>` before conversion. Uses the same Playwright/Chromium context as computed styles.
   * Ephemeral spawn pages mutate in place by default; live `page` + `rootSelector` clones
   * off-screen unless `{ mutate: true }`.
   */
  rasterizeInPlace?: boolean | RasterizeInPlaceOptions;
  /**
   * Resolve non-`data:` `<img src>` (e.g. `http(s):` / `file:`). The library never fetches
   * on its own — supply this hook to enable remote/local images, and own the fetch plus its
   * security policy (host allowlist, SSRF/private-IP blocking, auth, size caps). Without it,
   * only inline `data:` URLs embed; other images fall back to alt text.
   */
  imageResolver?: ImageResolver;
  // Page layout, default font, and metadata come from DocumentConfig (pageSize,
  // orientation, margins, defaultFont, metadata).
}

function documentConfig(options?: ConvertOptions): DocumentConfig | undefined {
  if (!options) return undefined;
  const { pageSize, orientation, margins, defaultFont, metadata, headerHtml, footerHtml, pageNumber, lang, direction } = options;
  return { pageSize, orientation, margins, defaultFont, metadata, headerHtml, footerHtml, pageNumber, lang, direction };
}

interface ResolveResult {
  resolver: StyleResolver;
  exportHtml: string;
  ownsBrowser: Browser | null;
  ownsPage: Page | null;
  cleanupRasterize: (() => Promise<void>) | null;
}

async function resolveStyleAndExportHtml(
  html: string,
  styleSource: StyleSource,
  options?: ConvertOptions,
): Promise<ResolveResult> {
  if (styleSource === "inline" && !options?.rasterizeInPlace) {
    return {
      resolver: INLINE_STYLE_RESOLVER,
      exportHtml: html,
      ownsBrowser: null,
      ownsPage: null,
      cleanupRasterize: null,
    };
  }

  let ownsBrowser: Browser | null = null;
  let ownsPage: Page | null = null;
  let page = options?.page ?? null;

  if (!page) {
    let browser = options?.browser;
    if (!browser) {
      const { chromium } = await import("playwright");
      ownsBrowser = await chromium.launch();
      browser = ownsBrowser;
    }
    if (styleSource === "computed" || options?.rasterizeInPlace) {
      page = await openPlaywrightPage(html, browser);
      ownsPage = page;
    }
  }

  let exportHtml = html;
  let snapshotRootSelector = options?.rootSelector;
  let cleanupRasterize: (() => Promise<void>) | null = null;

  if (options?.rasterizeInPlace && page) {
    const rasterOpts =
      options.rasterizeInPlace === true ? undefined : options.rasterizeInPlace;
    const mutate =
      rasterOpts?.mutate ?? (!options?.page && !options?.rootSelector);
    const prepared = await preparePlaywrightRasterizedExport(
      page,
      snapshotRootSelector ?? null,
      rasterOpts,
      mutate,
    );
    exportHtml = prepared.html;
    snapshotRootSelector = prepared.snapshotRootSelector ?? undefined;
    if (prepared.cleanupSelector) {
      const cleanupSelector = prepared.cleanupSelector;
      cleanupRasterize = async () => {
        await page!.evaluate((sel) => document.querySelector(sel)?.remove(), cleanupSelector);
      };
    }
  }

  const resolver =
    styleSource === "inline"
      ? INLINE_STYLE_RESOLVER
      : await computedStyleResolverFromPage(page!, snapshotRootSelector);

  return {
    resolver,
    exportHtml,
    ownsBrowser: ownsBrowser && !options?.browser ? ownsBrowser : null,
    ownsPage,
    cleanupRasterize,
  };
}

export async function buildDocxBuffer(
  html: string,
  styleResolver: StyleResolver,
  imageResolver?: ImageResolver,
  docConfig?: DocumentConfig,
): Promise<Buffer> {
  return Buffer.from(await buildDocxUint8Array(html, styleResolver, imageResolver, docConfig));
}

export async function convertHtmlToDocx(
  html: string,
  options?: ConvertOptions,
): Promise<Buffer> {
  const styleSource = options?.styleSource ?? "inline";
  const { resolver, exportHtml, ownsBrowser, ownsPage, cleanupRasterize } =
    await resolveStyleAndExportHtml(html, styleSource, options);
  try {
    return await buildDocxBuffer(
      exportHtml,
      resolver,
      options?.imageResolver,
      documentConfig(options),
    );
  } finally {
    if (cleanupRasterize) await cleanupRasterize();
    if (ownsPage) await ownsPage.close();
    if (ownsBrowser) await ownsBrowser.close();
  }
}
