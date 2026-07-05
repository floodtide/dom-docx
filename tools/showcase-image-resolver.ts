import { readFile } from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";
import {
  applyImageResolver,
  type ImageResolver,
  type ResolvedImage,
} from "../src/converter/image.js";

const IMAGE_EXT: Record<string, ResolvedImage["type"]> = {
  png: "png",
  jpg: "jpg",
  jpeg: "jpg",
  gif: "gif",
  bmp: "bmp",
};

/** Resolve relative `<img src>` paths from `examples/{showcaseName}/`. */
export function createShowcaseImageResolver(showcaseName: string, assetsRoot: string): ImageResolver {
  const assetsDir = path.join(assetsRoot, showcaseName);

  return async (src) => {
    if (/^data:/i.test(src) || /^https?:/i.test(src)) return null;

    const rel = src.replace(/^\.\//, "");
    if (!rel || rel.includes("..") || path.isAbsolute(rel)) return null;

    const type = IMAGE_EXT[path.extname(rel).slice(1).toLowerCase()];
    if (!type) return null;

    try {
      const data = await readFile(path.join(assetsDir, rel));
      return { data, type };
    } catch {
      return null;
    }
  };
}

/** Rewrite non-data `<img src>` to inline data URLs so previews and conversion match. */
export async function resolveFragmentImages(
  html: string,
  resolver: ImageResolver,
): Promise<string> {
  const $ = cheerio.load(`<body>${html.trim()}</body>`, { xml: false });
  await applyImageResolver($, resolver);
  return $("body").html() ?? html;
}
