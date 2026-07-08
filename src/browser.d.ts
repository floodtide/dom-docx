export type StyleSource = "inline" | "computed";

export interface StyleResolver {
  getCss(element: unknown): ParsedCss;
}

export interface ParsedCss {
  color?: string;
  backgroundColor?: string;
  textAlign?: string;
  fontSize?: string;
  fontWeight?: string;
  fontStyle?: string;
  marginTop?: string;
  marginRight?: string;
  marginBottom?: string;
  marginLeft?: string;
  paddingTop?: string;
  paddingRight?: string;
  paddingBottom?: string;
  paddingLeft?: string;
  borderTop?: string;
  borderRight?: string;
  borderBottom?: string;
  borderLeft?: string;
  display?: string;
  flexDirection?: string;
  gap?: string;
  width?: string;
}

export interface DocumentConfig {
  pageSize?: "letter" | "a4" | { width: number; height: number };
  orientation?: "portrait" | "landscape";
  margins?: { top?: number; right?: number; bottom?: number; left?: number };
  defaultFont?: { family?: string; sizePt?: number };
  metadata?: {
    title?: string;
    subject?: string;
    creator?: string;
    keywords?: string[];
    description?: string;
  };
}

export interface RasterizeInPlaceOptions {
  /**
   * Mutate the caller's `root` instead of cloning. Default false — cloning avoids
   * disturbing a live SPA (Vue/React) while charts are replaced only on the export copy.
   */
  mutate?: boolean;
  /** Extra CSS selectors to rasterize (e.g. `.highcharts-container`). */
  selectors?: string[];
}

export interface BrowserConvertOptions {
  styleSource?: StyleSource;
  /** Document to snapshot for `styleSource: "computed"`. Defaults to the host page. */
  document?: Document;
  /** Export root — pass the live element whose innerHTML is converted (SPA export pattern). */
  root?: Element;
  /** Rasterize canvas/chart SVG under `root` before conversion (requires `root`). */
  rasterizeInPlace?: boolean | RasterizeInPlaceOptions;
  /** Resolve non-`data:` `<img src>` before conversion (caller owns fetch policy). */
  imageResolver?: (
    src: string,
  ) => Promise<{ data: Uint8Array | ArrayBuffer; type: "png" | "jpg" | "gif" | "bmp"; width?: number; height?: number } | null> | { data: Uint8Array | ArrayBuffer; type: "png" | "jpg" | "gif" | "bmp"; width?: number; height?: number } | null;
}

export declare function convertHtmlToDocxUint8Array(
  html: string,
  options?: BrowserConvertOptions,
): Promise<Uint8Array>;

/** Returns a `.docx` Blob (uses `Packer.toBlob` under the hood). */
export declare function convertHtmlToDocx(
  html: string,
  options?: BrowserConvertOptions,
): Promise<Blob>;

export declare function buildDocxUint8Array(
  html: string,
  styleResolver: StyleResolver,
  imageResolver?: unknown,
  documentConfig?: DocumentConfig,
): Promise<Uint8Array>;

export declare function buildDocxBlob(
  html: string,
  styleResolver: StyleResolver,
  imageResolver?: unknown,
  documentConfig?: DocumentConfig,
): Promise<Blob>;

export interface ComputedStyleSnapshot {
  path: string;
  styles: Record<string, string>;
}

export declare function snapshotComputedStylesFromDocument(
  doc?: Document,
  root?: Element | null,
): ComputedStyleSnapshot[];

export declare function rasterizeInPlace(root: Element, options?: RasterizeInPlaceOptions): Promise<void>;

export declare function isSimpleSvgElement(svg: Element): boolean;

export interface DomDocxGlobal {
  convertHtmlToDocx: typeof convertHtmlToDocx;
  convertHtmlToDocxUint8Array: typeof convertHtmlToDocxUint8Array;
}

declare global {
  interface Window {
    domDocx?: DomDocxGlobal;
  }
}

export {};
