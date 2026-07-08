import { ImageRun } from "docx";
import type { CheerioAPI } from "cheerio";
import type { Element } from "domhandler";

type ImageType = "png" | "jpg" | "gif" | "bmp";

const MIME_TO_TYPE: Record<string, ImageType> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/bmp": "bmp",
};

const TYPE_TO_MIME: Record<ImageType, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
};

/** Raw image bytes a caller's {@link ImageResolver} returns for a non-`data:` `src`. */
export interface ResolvedImage {
  /** Encoded image bytes (not base64 — the raw file contents). */
  readonly data: Uint8Array | ArrayBuffer;
  readonly type: ImageType;
  /** Optional intrinsic size (px); used only when the `<img>` omits width/height. */
  readonly width?: number;
  readonly height?: number;
}

/**
 * Caller-supplied hook to resolve non-`data:` `<img src>` (e.g. `http(s):` / `file:`).
 * The library never fetches on its own — the caller owns the network/filesystem access
 * and its security policy (host allowlist, SSRF/private-IP blocking, auth, size caps).
 * Return `null` to skip an image (it falls back to alt text).
 */
export type ImageResolver = (
  src: string,
) => Promise<ResolvedImage | null> | ResolvedImage | null;

function toBase64(data: Uint8Array | ArrayBuffer): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  // Browser-safe fallback.
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function decodeBase64(base64: string): Uint8Array {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(base64, "base64"));
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Encode a resolved image as a `data:` URL so the sync conversion path handles it uniformly. */
export function resolvedImageToDataUrl(resolved: ResolvedImage): string {
  return `data:${TYPE_TO_MIME[resolved.type]};base64,${toBase64(resolved.data)}`;
}

/**
 * Pre-resolution pass (run before the synchronous tree walk): for every `<img>` whose
 * `src` is not already a `data:` URL, ask the caller's resolver for bytes and, if given,
 * rewrite `src` to an inline `data:` URL. Unresolved images keep their `src` and fall
 * back to alt text. Resolver errors are swallowed per-image (never abort the conversion).
 */
export async function applyImageResolver(
  $: CheerioAPI,
  resolver: ImageResolver,
): Promise<void> {
  const targets = $("img")
    .toArray()
    .filter((el) => {
      const src = el.attribs?.src;
      return typeof src === "string" && src.length > 0 && !/^data:/i.test(src);
    });

  await Promise.all(
    targets.map(async (el) => {
      try {
        const resolved = await resolver(el.attribs.src);
        if (!resolved) return;
        el.attribs.src = resolvedImageToDataUrl(resolved);
        if (resolved.width && !el.attribs.width) el.attribs.width = String(resolved.width);
        if (resolved.height && !el.attribs.height) el.attribs.height = String(resolved.height);
      } catch {
        // Leave src untouched → alt-text fallback. The caller's resolver owns errors.
      }
    }),
  );
}

interface DecodedImage {
  type: ImageType;
  data: Uint8Array;
}

/** Parse a `data:<mime>;base64,<payload>` URL into raw bytes + docx image type. */
function parseDataUrl(src: string): DecodedImage | null {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/is.exec(src.trim());
  if (!match) return null;
  const mime = (match[1] ?? "image/png").toLowerCase();
  const isBase64 = Boolean(match[2]);
  const type = MIME_TO_TYPE[mime];
  if (!type || !isBase64) return null; // only base64 raster data URLs for now
  try {
    return { type, data: decodeBase64(match[3]) };
  } catch {
    return null;
  }
}

/** Natural pixel dimensions from a decoded raster header (PNG / GIF / BMP / JPEG). */
function naturalSize(type: ImageType, data: Uint8Array): { w: number; h: number } | null {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  try {
    if (type === "png" && data.length >= 24) {
      // IHDR width/height are big-endian uint32 at byte 16 / 20.
      return { w: view.getUint32(16), h: view.getUint32(20) };
    }
    if (type === "gif" && data.length >= 10) {
      // Logical screen width/height are little-endian uint16 at byte 6 / 8.
      return { w: view.getUint16(6, true), h: view.getUint16(8, true) };
    }
    if (type === "bmp" && data.length >= 26) {
      return { w: view.getInt32(18, true), h: Math.abs(view.getInt32(22, true)) };
    }
    if (type === "jpg") {
      // Scan SOF markers for frame dimensions.
      let off = 2;
      while (off + 9 < data.length) {
        if (view.getUint8(off) !== 0xff) {
          off++;
          continue;
        }
        const marker = view.getUint8(off + 1);
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { h: view.getUint16(off + 5), w: view.getUint16(off + 7) };
        }
        off += 2 + view.getUint16(off + 2);
      }
    }
  } catch {
    return null;
  }
  return null;
}

function attrPx(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** docx assigns docPr id=1 per ImageRun unless overridden — reset per document build. */
let nextImageDocPrId = 1;

export function resetImageDocPrIds(): void {
  nextImageDocPrId = 1;
}

/**
 * Build a docx `ImageRun` from an `<img>` element. Supports base64 `data:` raster
 * URLs (png/jpg/gif/bmp). Display size comes from `width`/`height` attributes,
 * falling back to the image's natural size (aspect-preserved if only one is given).
 * Returns null for unsupported sources (e.g. remote URLs) — caller drops to alt text.
 */
export function imageRunFromElement(element: Element): ImageRun | null {
  const src = element.attribs?.src;
  if (!src) return null;

  const decoded = parseDataUrl(src);
  if (!decoded) return null;

  const natural = naturalSize(decoded.type, decoded.data);
  let width = attrPx(element.attribs?.width);
  let height = attrPx(element.attribs?.height);

  if (width && !height) height = natural ? Math.round((width / natural.w) * natural.h) : width;
  else if (height && !width) width = natural ? Math.round((height / natural.h) * natural.w) : height;
  else if (!width && !height) {
    width = natural?.w ?? 200;
    height = natural?.h ?? 150;
  }

  const docPrId = String(nextImageDocPrId++);
  const alt = element.attribs?.alt;
  return new ImageRun({
    type: decoded.type,
    data: decoded.data,
    transformation: { width: width!, height: height! },
    altText: alt
      ? { id: docPrId, title: alt, description: alt, name: alt }
      : { id: docPrId, name: "Image" },
  });
}
