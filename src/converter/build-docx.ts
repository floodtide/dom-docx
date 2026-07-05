import {
  AlignmentType,
  Document,
  Footer,
  Header,
  PageNumber,
  Packer,
  PageOrientation,
  Paragraph,
  TextRun,
  convertInchesToTwip,
  type FileChild,
} from "docx";
import * as cheerio from "cheerio";
import { unzipSync, zipSync } from "fflate";
import { BODY_FONT, BODY_FONT_HALF_POINTS, NUMBERING_CONFIG, PAGE_MARGIN_TWIPS } from "./constants.js";
import { patchDocumentXml, patchNumberingXml } from "./ooxml-patch.js";
import { applyImageResolver, type ImageResolver } from "./image.js";
import { INLINE_STYLE_RESOLVER, type StyleResolver } from "./style-resolver.js";
import { htmlToDocxBlocks } from "./visitor.js";

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
  /** Append a centered `Page N` field to the footer (created if `footerHtml` is absent). */
  pageNumber?: boolean;
  /** Document language (spell-check locale), e.g. `"en-US"`, `"ar-SA"`. */
  lang?: string;
  /** Text direction; `"rtl"` sets right-to-left paragraphs. */
  direction?: "ltr" | "rtl";
}

// Portrait dimensions in twips. Letter matches convertInchesToTwip(8.5)×(11).
const PAGE_PRESETS_TWIPS = {
  letter: { width: 12240, height: 15840 },
  a4: { width: 11906, height: 16838 },
} as const;

interface ResolvedConfig {
  size: { width: number; height: number; orientation?: (typeof PageOrientation)[keyof typeof PageOrientation] };
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

function resolveDocumentConfig(config?: DocumentConfig): ResolvedConfig {
  const ps = config?.pageSize;
  const base =
    !ps || ps === "letter"
      ? PAGE_PRESETS_TWIPS.letter
      : ps === "a4"
        ? PAGE_PRESETS_TWIPS.a4
        : { width: convertInchesToTwip(ps.width), height: convertInchesToTwip(ps.height) };

  // docx swaps width/height itself for landscape, so pass portrait dims + the flag.
  const size =
    config?.orientation === "landscape"
      ? { width: base.width, height: base.height, orientation: PageOrientation.LANDSCAPE }
      : { width: base.width, height: base.height };

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
    size,
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

/** Convert a standalone HTML fragment (header/footer) to DOCX blocks via the inline resolver. */
function fragmentToBlocks(html: string, sizeHalfPoints: number): FileChild[] {
  const $ = cheerio.load(`<body>${html.trim()}</body>`, { xml: false });
  return htmlToDocxBlocks($, INLINE_STYLE_RESOLVER, sizeHalfPoints);
}

function pageNumberParagraph(): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun("Page "), new TextRun({ children: [PageNumber.CURRENT] })],
  });
}

function buildFooter(config: DocumentConfig | undefined, resolved: ResolvedConfig): Footer | undefined {
  const hasFooterHtml = Boolean(config?.footerHtml);
  if (!hasFooterHtml && !config?.pageNumber) return undefined;
  const children: FileChild[] = hasFooterHtml
    ? fragmentToBlocks(config!.footerHtml!, resolved.fontHalfPoints)
    : [];
  if (config?.pageNumber) children.push(pageNumberParagraph());
  return new Footer({ children });
}

function buildHeader(config: DocumentConfig | undefined, resolved: ResolvedConfig): Header | undefined {
  if (!config?.headerHtml) return undefined;
  return new Header({ children: fragmentToBlocks(config.headerHtml, resolved.fontHalfPoints) });
}

async function packDocxToUint8Array(
  children: FileChild[],
  resolved: ResolvedConfig,
  chrome: { header?: Header; footer?: Footer },
): Promise<Uint8Array> {
  const listStyleRun = { font: resolved.font, size: resolved.fontHalfPoints };
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
    sections: [
      {
        properties: {
          page: {
            size: resolved.size,
            margin: resolved.margin,
          },
        },
        ...(chrome.header ? { headers: { default: chrome.header } } : {}),
        ...(chrome.footer ? { footers: { default: chrome.footer } } : {}),
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  return new Uint8Array(await blob.arrayBuffer());
}

function patchPackedDocx(packed: Uint8Array): Uint8Array {
  const files = unzipSync(packed);
  const documentXml = new TextDecoder().decode(files["word/document.xml"]);
  files["word/document.xml"] = new TextEncoder().encode(patchDocumentXml(documentXml));
  if (files["word/numbering.xml"]) {
    const numberingXml = new TextDecoder().decode(files["word/numbering.xml"]);
    files["word/numbering.xml"] = new TextEncoder().encode(patchNumberingXml(numberingXml));
  }
  return zipSync(files);
}

/** Platform-neutral DOCX bytes from an HTML body fragment and style resolver. */
export async function buildDocxUint8Array(
  html: string,
  styleResolver: StyleResolver,
  imageResolver?: ImageResolver,
  documentConfig?: DocumentConfig,
): Promise<Uint8Array> {
  const resolved = resolveDocumentConfig(documentConfig);
  const $ = cheerio.load(`<body>${html.trim()}</body>`, { xml: false });
  if (imageResolver) await applyImageResolver($, imageResolver);
  const children = htmlToDocxBlocks($, styleResolver, resolved.fontHalfPoints);
  const chrome = {
    header: buildHeader(documentConfig, resolved),
    footer: buildFooter(documentConfig, resolved),
  };
  const packed = await packDocxToUint8Array(children, resolved, chrome);
  return patchPackedDocx(packed);
}

/** Browser entry — returns a `.docx` Blob. */
export async function buildDocxBlob(
  html: string,
  styleResolver: StyleResolver,
  imageResolver?: ImageResolver,
  documentConfig?: DocumentConfig,
): Promise<Blob> {
  const bytes = await buildDocxUint8Array(html, styleResolver, imageResolver, documentConfig);
  return new Blob([bytes.slice()], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}
