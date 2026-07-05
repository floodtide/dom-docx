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

export interface BrowserConvertOptions {
  styleSource?: StyleSource;
  /** Document to snapshot for `styleSource: "computed"`. Defaults to the host page. */
  document?: Document;
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

export declare function snapshotComputedStylesFromDocument(): ReadonlyMap<string, ParsedCss>;

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
