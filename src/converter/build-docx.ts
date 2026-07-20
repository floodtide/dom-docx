import {
  Document,
  Footer,
  Header,
  PageBreak,
  Packer,
  PageOrientation,
  Paragraph,
  convertInchesToTwip,
  type FileChild,
} from "docx";
import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import { unzipSync, zipSync } from "fflate";
import { BODY_FONT, BODY_FONT_HALF_POINTS, NUMBERING_CONFIG, PAGE_MARGIN_TWIPS } from "./constants.js";
import { patchDocumentXml, patchFldSimple, patchNumberingXml } from "./ooxml-patch.js";
import { applyImageResolver, hasUnresolvedSrc, resetImageDocPrIds, type ImageResolver } from "./image.js";
import { INLINE_STYLE_RESOLVER, type StyleResolver } from "./style-resolver.js";
import { htmlToDocxBlocks } from "./visitor.js";

/**
 * Diagnostic callback for conditions that don't fail the conversion but silently
 * degrade the output (an image that never embeds, styling that never applies).
 * Pass `null` to suppress the default `console.warn`.
 */
export type WarningHandler = (message: string) => void;

function resolveWarningHandler(onWarning: WarningHandler | null | undefined): WarningHandler {
  if (onWarning === null) return () => {};
  return onWarning ?? ((message) => console.warn(message));
}

/**
 * Flag conditions that produce a structurally valid but visually degraded docx —
 * dropped images, ignored class/stylesheet CSS — so they surface instead of being
 * discovered only by opening the file. Best-effort heuristics, not exhaustive.
 */
function emitDegradationWarnings(
  $: CheerioAPI,
  styleResolver: StyleResolver,
  hadImageResolver: boolean,
  warn: WarningHandler,
): void {
  const unresolvedImages = $("img").toArray().filter(hasUnresolvedSrc).length;
  if (unresolvedImages > 0) {
    warn(
      hadImageResolver
        ? `dom-docx: ${unresolvedImages} image(s) could not be resolved by imageResolver (returned null or threw) — they will render as alt text only.`
        : `dom-docx: ${unresolvedImages} image(s) have a non-data: src (remote/relative URL) and no imageResolver was provided — they will render as alt text only. Pass options.imageResolver to embed them.`,
    );
  }

  if (styleResolver === INLINE_STYLE_RESOLVER) {
    const hasStylesheetSignal = $("style").length > 0 || $('link[rel="stylesheet"]').length > 0;
    if (hasStylesheetSignal) {
      warn(
        'dom-docx: detected a <style> block or external stylesheet, but styleSource is "inline" (the default) — ' +
          "only inline style=\"\" attributes are read, so class-based CSS is ignored. Pass styleSource: \"computed\" " +
          "to resolve it (Node: requires Playwright; browser: uses the live DOM).",
      );
    }
  }
}

/** Page/font/metadata options (Tier 1 `ConvertOptions`). All lengths in inches / points. */
export interface DocumentConfig {
  /** `"letter"` (default), `"a4"`, or a custom size in inches. */
  pageSize?: "letter" | "a4" | { width: number; height: number };
  orientation?: "portrait" | "landscape";
  /** Page margins in inches (each side defaults to 1). */
  margins?: { top?: number; right?: number; bottom?: number; left?: number };
  /** Default body font family and size (points). */
  defaultFont?: { family?: string; sizePt?: number };
  /** Core document properties written to `docProps/core.xml`. */
  metadata?: {
    title?: string;
    subject?: string;
    creator?: string;
    keywords?: string[];
    description?: string;
  };
  /** HTML fragment rendered as the page header (its own inline-styled fragment). */
  headerHtml?: string;
  /** HTML fragment rendered as the page footer. */
  footerHtml?: string;
  /**
   * Append a page-number paragraph to the footer (created if `footerHtml` is absent).
   * - `true` — shorthand for `"Page {page}"`
   * - `string` — template with `{page}` (current page) and/or `{pages}` (total pages),
   *   e.g. `"{page} / {pages}"` or `"Seite {page} von {pages}"`.
   *   Wrap in HTML for alignment/formatting: `'<p style="text-align:right;font-weight:bold">{page}/{pages}</p>'`
   *
   * The `{page}` / `{pages}` tokens also work anywhere inside `footerHtml` and `headerHtml`.
   */
  pageNumber?: boolean | string;
  /** Document language (spell-check locale), e.g. `"en-US"`, `"ar-SA"`. */
  lang?: string;
  /** Text direction; `"rtl"` sets right-to-left paragraphs. */
  direction?: "ltr" | "rtl";
  /**
   * HTML fragment rendered as a cover page: the first content in the document,
   * before the table of contents (if any), followed by an automatic page break so
   * the TOC/body start on the next page. Uses the inline style path like
   * `headerHtml`/`footerHtml` — inline `style="…"` and `data:` images (e.g. a logo)
   * work. When a header/footer/page number is configured, it is suppressed on the
   * cover page (Word "different first page").
   */
  coverHtml?: string;
  /**
   * HTML fragment rendered as a table-of-contents "slot": placed after the cover
   * page (if any) and before the body. You control the markup and styling — a
   * numbered or boxed list, columns, whatever — and in-page links (`<a href="#id">`)
   * jump to the matching `id` in the body (dom-docx bookmarks `id` attributes). Add
   * a trailing `<div style="break-after:page"></div>` if you want it on its own page.
   */
  tocHtml?: string;
}

// Portrait dimensions in twips. Letter matches convertInchesToTwip(8.5)×(11).
const PAGE_PRESETS_TWIPS = {
  letter: { width: 12240, height: 15840 },
  a4: { width: 11906, height: 16838 },
} as const;

type Orientation = "portrait" | "landscape";

interface PageRules {
  defaultOrientation?: Orientation;
  namedOrientations: Record<string, Orientation>;
  classToPage: Record<string, string>;
}

interface BodySection {
  orientation: Orientation | undefined;
  children: FileChild[];
}

interface ResolvedConfig {
  pageSize: { width: number; height: number };
  defaultOrientation: Orientation | undefined;
  margin: { top: number; right: number; bottom: number; left: number };
  font: string;
  fontHalfPoints: number;
  metadata: {
    title?: string;
    subject?: string;
    creator?: string;
    keywords?: string;
    description?: string;
  };
  lang?: string;
  rtl: boolean;
}

function toInches(value: number, unit: string): number | null {
  switch (unit.toLowerCase()) {
    case "in":
      return value;
    case "cm":
      return value / 2.54;
    case "mm":
      return value / 25.4;
    case "q":
      return value / 101.6;
    case "pt":
      return value / 72;
    case "pc":
      return value / 6;
    case "px":
      return value / 96;
    default:
      return null;
  }
}

function parseLengthToken(token: string): number | null {
  const m = token.trim().toLowerCase().match(/^([0-9]*\.?[0-9]+)(in|cm|mm|q|pt|pc|px)$/);
  if (!m) return null;
  const numeric = Number(m[1]);
  if (!Number.isFinite(numeric)) return null;
  return toInches(numeric, m[2]!);
}

function inferOrientationFromPageSizeValue(value: string): Orientation | null {
  const lower = value.trim().toLowerCase();
  if (lower.includes("landscape")) return "landscape";
  if (lower.includes("portrait")) return "portrait";
  const tokens = lower.split(/\s+/).filter(Boolean);
  const lengthTokens = tokens.filter((token) => parseLengthToken(token) !== null);
  if (lengthTokens.length < 2) return null;
  const widthIn = parseLengthToken(lengthTokens[0]!);
  const heightIn = parseLengthToken(lengthTokens[1]!);
  if (widthIn === null || heightIn === null || widthIn === heightIn) return null;
  return widthIn > heightIn ? "landscape" : "portrait";
}

function parseCssPageRules(html: string): PageRules {
  const namedOrientations: Record<string, Orientation> = {};
  const classToPage: Record<string, string> = {};
  let defaultOrientation: Orientation | undefined;
  const styleBlocks = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]!);
  for (const cssText of styleBlocks) {
    const pageRulePattern = /@page\s*([^\{]*)\{([\s\S]*?)\}/gi;
    for (const match of cssText.matchAll(pageRulePattern)) {
      const selector = (match[1] ?? "").trim();
      const body = match[2] ?? "";
      const sizeDecl = body.match(/(?:^|[;\s])size\s*:\s*([^;}]*)/i);
      if (!sizeDecl?.[1]) continue;
      const inferred = inferOrientationFromPageSizeValue(sizeDecl[1]);
      if (!inferred) continue;
      if (!selector || selector.startsWith(":")) {
        if (!defaultOrientation) defaultOrientation = inferred;
        continue;
      }
      const pageName = selector.split(":")[0]?.trim().toLowerCase();
      if (pageName) namedOrientations[pageName] = inferred;
    }
    // Class-based section mapping (e.g. `div.WordSection2 { page: WordSection2; }`).
    for (const ruleMatch of cssText.matchAll(/([^{}]+)\{([\s\S]*?)\}/g)) {
      const selectorList = (ruleMatch[1] ?? "").trim();
      const body = ruleMatch[2] ?? "";
      if (!selectorList || selectorList.startsWith("@")) continue;
      const pageDecl = body.match(/(?:^|[;\s])page\s*:\s*([^;}]*)/i);
      if (!pageDecl?.[1]) continue;
      const pageTarget = pageDecl[1].trim().replace(/^['"]|['"]$/g, "").toLowerCase();
      if (!pageTarget || pageTarget === "auto") continue;
      for (const selector of selectorList.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)) {
        const classMatch = selector.match(/(?:^|\s|>)(?:[a-z0-9_-]+\.)?([a-z0-9_-]+)/i);
        const dotIdx = selector.indexOf(".");
        if (dotIdx === -1 || !classMatch?.[1]) continue;
        classToPage[classMatch[1].toLowerCase()] = pageTarget;
      }
    }
  }
  return { defaultOrientation, namedOrientations, classToPage };
}

function inlinePageName(styleValue: string | undefined): string | undefined {
  if (!styleValue) return undefined;
  const pageDecl = styleValue
    .split(";")
    .map((part) => part.trim())
    .find((part) => /^page\s*:/i.test(part));
  if (!pageDecl) return undefined;
  const [, value = ""] = pageDecl.split(":", 2);
  const page = value.trim().toLowerCase();
  if (!page || page === "auto") return undefined;
  return page;
}

function pageNameToOrientation(pageName: string | undefined, rules: PageRules): Orientation | undefined {
  if (!pageName) return undefined;
  if (pageName === "portrait" || pageName === "landscape") return pageName;
  return rules.namedOrientations[pageName];
}

function classPageName(classAttr: string | undefined, rules: PageRules): string | undefined {
  if (!classAttr) return undefined;
  for (const className of classAttr.split(/\s+/).map((c) => c.trim().toLowerCase()).filter(Boolean)) {
    const page = rules.classToPage[className];
    if (page) return page;
  }
  return undefined;
}

/**
 * Split the body's top-level nodes into contiguous chunks that share a page
 * orientation (via inline `style="page:…"` or class-mapped `page:` CSS), then
 * convert each chunk to DOCX blocks. Each chunk becomes its own DOCX section.
 */
function buildBodySections(
  $: CheerioAPI,
  styleResolver: StyleResolver,
  fontHalfPoints: number,
  baseOrientation: Orientation | undefined,
  pageRules: PageRules,
  allowMixedOrientation: boolean,
): BodySection[] {
  const chunks: Array<{ orientation: Orientation | undefined; htmlParts: string[] }> = [
    { orientation: baseOrientation, htmlParts: [] },
  ];
  let currentOrientation = baseOrientation;
  for (const node of $("body").contents().toArray()) {
    if (node.type === "tag" && node.name.toLowerCase() === "style") {
      continue;
    }
    // Ignore formatting whitespace between top-level nodes so it does not
    // become an empty paragraph/section in the generated DOCX.
    if (node.type === "text" && !(node.data ?? "").trim()) {
      continue;
    }
    let targetOrientation = currentOrientation;
    if (allowMixedOrientation && node.type === "tag") {
      const pageName = inlinePageName($(node).attr("style")) ?? classPageName($(node).attr("class"), pageRules);
      const oriented = pageNameToOrientation(pageName, pageRules);
      if (oriented) targetOrientation = oriented;
    }
    const rendered = $.html(node);
    if (!rendered) continue;
    const last = chunks.at(-1)!;
    if (last.htmlParts.length && targetOrientation !== currentOrientation) {
      chunks.push({ orientation: targetOrientation, htmlParts: [rendered] });
    } else {
      last.htmlParts.push(rendered);
      last.orientation = targetOrientation;
    }
    currentOrientation = targetOrientation;
  }
  const sections: BodySection[] = [];
  for (const chunk of chunks) {
    const chunkHtml = chunk.htmlParts.join("").trim();
    if (!chunkHtml) continue;
    const chunk$ = cheerio.load(`<body>${chunkHtml}</body>`, { xml: false });
    const children = htmlToDocxBlocks(chunk$, styleResolver, fontHalfPoints);
    if (children.length === 0) continue;
    sections.push({
      orientation: chunk.orientation,
      children,
    });
  }
  return sections;
}

function resolveDocumentConfig(
  config: DocumentConfig | undefined,
  inferredOrientation: Orientation | undefined,
): ResolvedConfig {
  const ps = config?.pageSize;
  const base =
    !ps || ps === "letter"
      ? PAGE_PRESETS_TWIPS.letter
      : ps === "a4"
        ? PAGE_PRESETS_TWIPS.a4
        : { width: convertInchesToTwip(ps.width), height: convertInchesToTwip(ps.height) };

  const effectiveOrientation = config?.orientation ?? inferredOrientation;

  const m = config?.margins;
  const marginIn = (v: number | undefined): number =>
    v !== undefined ? convertInchesToTwip(v) : PAGE_MARGIN_TWIPS;

  const meta = config?.metadata;
  const metadata: ResolvedConfig["metadata"] = {};
  if (meta?.title) metadata.title = meta.title;
  if (meta?.subject) metadata.subject = meta.subject;
  if (meta?.creator) metadata.creator = meta.creator;
  if (meta?.keywords?.length) metadata.keywords = meta.keywords.join(", ");
  if (meta?.description) metadata.description = meta.description;

  return {
    pageSize: { width: base.width, height: base.height },
    defaultOrientation: effectiveOrientation,
    margin: { top: marginIn(m?.top), right: marginIn(m?.right), bottom: marginIn(m?.bottom), left: marginIn(m?.left) },
    font: config?.defaultFont?.family ?? BODY_FONT,
    fontHalfPoints:
      config?.defaultFont?.sizePt !== undefined
        ? Math.round(config.defaultFont.sizePt * 2)
        : BODY_FONT_HALF_POINTS,
    metadata,
    lang: config?.lang,
    rtl: config?.direction === "rtl",
  };
}

// docx swaps width/height itself for landscape, so pass portrait dims + the flag.
function resolveSectionPageSize(
  resolved: ResolvedConfig,
  orientation: Orientation | undefined,
): { width: number; height: number; orientation?: (typeof PageOrientation)[keyof typeof PageOrientation] } {
  return orientation === "landscape"
    ? {
        width: resolved.pageSize.width,
        height: resolved.pageSize.height,
        orientation: PageOrientation.LANDSCAPE,
      }
    : { width: resolved.pageSize.width, height: resolved.pageSize.height };
}

/** Replace `{page}` / `{pages}` tokens with data-attribute spans the inline converter understands. */
function injectFieldTokens(html: string): string {
  return html
    .replace(/\{page\}/gi, '<span data-docx-field="PAGE"></span>')
    .replace(/\{pages\}/gi, '<span data-docx-field="NUMPAGES"></span>');
}

/** Convert a standalone HTML fragment (header/footer) to DOCX blocks via the inline resolver. */
function fragmentToBlocks(html: string, sizeHalfPoints: number): FileChild[] {
  const $ = cheerio.load(`<body>${injectFieldTokens(html.trim())}</body>`, { xml: false });
  return htmlToDocxBlocks($, INLINE_STYLE_RESOLVER, sizeHalfPoints);
}

/**
 * Caller-provided table-of-contents fragment, placed after the cover (if any) and
 * before the body. Rendered as ordinary body content via the inline style path;
 * in-page links (`<a href="#id">`) resolve to `id` bookmarks in the body. The
 * caller adds a trailing page break in the fragment if they want it on its own
 * page. Returns `[]` when no `tocHtml` is configured.
 */
function buildTocSlot(config: DocumentConfig | undefined, resolved: ResolvedConfig): FileChild[] {
  if (!config?.tocHtml) return [];
  return fragmentToBlocks(config.tocHtml, resolved.fontHalfPoints);
}

/**
 * Cover fragment as the document's first content, followed by a page break so the
 * TOC/body start on the next page. Converted via the inline style path (like
 * header/footer). Returns `[]` when no `coverHtml` is configured.
 */
function buildCover(config: DocumentConfig | undefined, resolved: ResolvedConfig): FileChild[] {
  if (!config?.coverHtml) return [];
  return [
    ...fragmentToBlocks(config.coverHtml, resolved.fontHalfPoints),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

function buildFooter(config: DocumentConfig | undefined, resolved: ResolvedConfig): Footer | undefined {
  const hasFooterHtml = Boolean(config?.footerHtml);
  const pnTemplate =
    config?.pageNumber === true
      ? "Page {page}"
      : typeof config?.pageNumber === "string"
        ? config.pageNumber
        : null;
  if (!hasFooterHtml && pnTemplate === null) return undefined;
  const children: FileChild[] = hasFooterHtml
    ? fragmentToBlocks(config!.footerHtml!, resolved.fontHalfPoints)
    : [];
  if (pnTemplate !== null) {
    const isPlainTemplate = !pnTemplate.trimStart().startsWith("<");
    const html = isPlainTemplate ? `<p style="text-align:center">${pnTemplate}</p>` : pnTemplate;
    children.push(...fragmentToBlocks(html, resolved.fontHalfPoints));
  }
  return new Footer({ children });
}

function buildHeader(config: DocumentConfig | undefined, resolved: ResolvedConfig): Header | undefined {
  if (!config?.headerHtml) return undefined;
  return new Header({ children: fragmentToBlocks(config.headerHtml, resolved.fontHalfPoints) });
}

async function packDocxToUint8Array(
  bodySections: BodySection[],
  resolved: ResolvedConfig,
  chrome: { header?: Header; footer?: Footer },
  coverBlocks: FileChild[],
  tocSlotBlocks: FileChild[],
): Promise<Uint8Array> {
  const listStyleRun = { font: resolved.font, size: resolved.fontHalfPoints };
  // A cover page suppresses the header/footer/page-number on page 1 via Word's
  // "different first page" (titlePg + empty first-page header/footer).
  const suppressFirstChrome = coverBlocks.length > 0 && Boolean(chrome.header || chrome.footer);
  const nonEmptySections = bodySections.filter((section) => section.children.length > 0);
  const normalizedSections: BodySection[] =
    nonEmptySections.length > 0
      ? nonEmptySections
      : [{ orientation: resolved.defaultOrientation, children: [] }];
  const doc = new Document({
    ...resolved.metadata,
    numbering: NUMBERING_CONFIG,
    styles: {
      default: {
        document: {
          run: {
            font: resolved.font,
            size: resolved.fontHalfPoints,
            ...(resolved.lang ? { language: { value: resolved.lang } } : {}),
            ...(resolved.rtl ? { rightToLeft: true } : {}),
          },
        },
      },
      paragraphStyles: [
        {
          id: "ListNumber",
          name: "List Number",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: listStyleRun,
        },
        {
          id: "ListBullet",
          name: "List Bullet",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: listStyleRun,
        },
      ],
    },
    sections: normalizedSections.map((section, idx) => ({
      properties: {
        page: {
          size: resolveSectionPageSize(resolved, section.orientation),
          margin: resolved.margin,
        },
        ...(idx === 0 && suppressFirstChrome ? { titlePage: true } : {}),
      },
      ...(chrome.header
        ? {
            headers:
              idx === 0 && suppressFirstChrome
                ? { default: chrome.header, first: new Header({ children: [] }) }
                : { default: chrome.header },
          }
        : {}),
      ...(chrome.footer
        ? {
            footers:
              idx === 0 && suppressFirstChrome
                ? { default: chrome.footer, first: new Footer({ children: [] }) }
                : { default: chrome.footer },
          }
        : {}),
      children: idx === 0 ? [...coverBlocks, ...tocSlotBlocks, ...section.children] : section.children,
    })),
  });

  const blob = await Packer.toBlob(doc);
  return new Uint8Array(await blob.arrayBuffer());
}

function patchPackedDocx(packed: Uint8Array): Uint8Array {
  const files = unzipSync(packed);
  const dec = new TextDecoder();
  const enc = new TextEncoder();

  files["word/document.xml"] = enc.encode(patchDocumentXml(dec.decode(files["word/document.xml"])));
  if (files["word/numbering.xml"]) {
    files["word/numbering.xml"] = enc.encode(patchNumberingXml(dec.decode(files["word/numbering.xml"])));
  }

  // Convert w:fldSimple in footer/header XMLs to proper 5-run complex field structure,
  // then promote inline rPr on field runs to named character styles so LibreOffice's
  // DOCX importer applies the formatting to text:page-number / text:page-count elements.
  // (LO ignores inline rPr on fldChar runs; it does respect w:rStyle named styles.)
  const chromeKeys = Object.keys(files).filter((k) => /^word\/(footer|header)\d*\.xml$/.test(k));
  if (chromeKeys.length === 0) return zipSync(files);

  // First pass: apply patchFldSimple and collect unique rPr sets from begin fldChar runs.
  const compactToId = new Map<string, string>();
  const idToRpr = new Map<string, string>();
  let counter = 0;
  const patchedChrome = new Map<string, string>();
  for (const key of chromeKeys) {
    const xml = patchFldSimple(dec.decode(files[key]));
    patchedChrome.set(key, xml);
    for (const m of xml.matchAll(/<w:rPr>((?:[^<]|<(?!\/w:rPr>))*)<\/w:rPr><w:fldChar w:fldCharType="begin"/g)) {
      const rPr = m[1];
      const compact = rPr.replace(/\s+/g, "");
      if (compact && !compactToId.has(compact)) {
        const id = `FldS${counter++}`;
        compactToId.set(compact, id);
        idToRpr.set(id, rPr);
      }
    }
  }

  if (idToRpr.size === 0) {
    for (const [key, xml] of patchedChrome) files[key] = enc.encode(xml);
    return zipSync(files);
  }

  // Second pass: replace inline rPr with w:rStyle on begin runs and display runs.
  const rStyleRpr = (rPr: string): string => {
    const id = compactToId.get(rPr.replace(/\s+/g, ""));
    return id ? `<w:rPr><w:rStyle w:val="${id}"/></w:rPr>` : `<w:rPr>${rPr}</w:rPr>`;
  };
  for (const [key, xml] of patchedChrome) {
    let patched = xml;
    patched = patched.replace(
      /<w:rPr>((?:[^<]|<(?!\/w:rPr>))*)<\/w:rPr>(<w:fldChar w:fldCharType="begin")/g,
      (_, rPr, fldChar) => `${rStyleRpr(rPr)}${fldChar}`,
    );
    patched = patched.replace(
      /(<w:r>)<w:rPr>((?:[^<]|<(?!\/w:rPr>))*)<\/w:rPr>(<w:t[^>]*>[\s\S]*?<\/w:t><\/w:r>(?=<w:r><w:fldChar w:fldCharType="end"))/g,
      (_, open, rPr, rest) => `${open}${rStyleRpr(rPr)}${rest}`,
    );
    files[key] = enc.encode(patched);
  }

  // Inject the character style definitions into word/styles.xml.
  if (files["word/styles.xml"]) {
    const charStyles = [...idToRpr.entries()]
      .map(
        ([id, rPr]) =>
          `<w:style w:type="character" w:customStyle="1" w:styleId="${id}">` +
          `<w:name w:val="${id}"/>` +
          `<w:basedOn w:val="DefaultParagraphFont"/>` +
          `<w:rPr>${rPr}</w:rPr>` +
          `</w:style>`,
      )
      .join("");
    files["word/styles.xml"] = enc.encode(
      dec.decode(files["word/styles.xml"]).replace("</w:styles>", `${charStyles}</w:styles>`),
    );
  }

  return zipSync(files);
}

/** Platform-neutral DOCX bytes from an HTML body fragment and style resolver. */
export async function buildDocxUint8Array(
  html: string,
  styleResolver: StyleResolver,
  imageResolver?: ImageResolver,
  documentConfig?: DocumentConfig,
  onWarning?: WarningHandler | null,
): Promise<Uint8Array> {
  resetImageDocPrIds();
  const pageRules = parseCssPageRules(html);
  const inferredOrientation = documentConfig?.orientation ? undefined : pageRules.defaultOrientation;
  const resolved = resolveDocumentConfig(documentConfig, inferredOrientation);
  const $ = cheerio.load(`<body>${html.trim()}</body>`, { xml: false });
  if (imageResolver) await applyImageResolver($, imageResolver);
  emitDegradationWarnings($, styleResolver, Boolean(imageResolver), resolveWarningHandler(onWarning));
  const bodySections = buildBodySections(
    $,
    styleResolver,
    resolved.fontHalfPoints,
    resolved.defaultOrientation,
    pageRules,
    !documentConfig?.orientation,
  );
  const chrome = {
    header: buildHeader(documentConfig, resolved),
    footer: buildFooter(documentConfig, resolved),
  };
  const coverBlocks = buildCover(documentConfig, resolved);
  const tocSlotBlocks = buildTocSlot(documentConfig, resolved);
  const packed = await packDocxToUint8Array(bodySections, resolved, chrome, coverBlocks, tocSlotBlocks);
  return patchPackedDocx(packed);
}

/** Browser entry — returns a `.docx` Blob. */
export async function buildDocxBlob(
  html: string,
  styleResolver: StyleResolver,
  imageResolver?: ImageResolver,
  documentConfig?: DocumentConfig,
  onWarning?: WarningHandler | null,
): Promise<Blob> {
  const bytes = await buildDocxUint8Array(html, styleResolver, imageResolver, documentConfig, onWarning);
  return new Blob([bytes.slice()], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}
