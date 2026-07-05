import { writeFile } from "node:fs/promises";
import { PNG } from "pngjs";
import { PAGE_MARGIN_PX, VIEWPORT_WIDTH_PX } from "../src/converter/constants.js";

/**
 * Rasterize page 1 of a PDF at the harness scale (viewport px / 612pt Letter width)
 * so PDF renders align pixel-for-pixel with the Chromium screenshot reference.
 */
export async function pdfFirstPageToPng(pdfPath: string, outPath: string): Promise<void> {
  const { pdf } = await import("pdf-to-img");
  const document = await pdf(pdfPath, { scale: VIEWPORT_WIDTH_PX / 612 });
  for await (const page of document) {
    await writeFile(outPath, page);
    return;
  }
  throw new Error(`No pages rendered from ${pdfPath}`);
}

/** Rendered pages to stitch before a document is considered "sampled enough". */
const MAX_STITCHED_PAGES = 12;

/**
 * Rasterize the WHOLE PDF as one continuous flow: all pages stacked with the
 * interior page-break margins removed (first page keeps its top margin, last
 * keeps its bottom — mirroring the browser's body padding). This makes the
 * comparison see the full document instead of page 1 only, so multi-page
 * spill stops reading as "missing content".
 */
export async function pdfToContentFlowPng(pdfPath: string, outPath: string): Promise<void> {
  const { pdf } = await import("pdf-to-img");
  const document = await pdf(pdfPath, { scale: VIEWPORT_WIDTH_PX / 612 });

  const pages: PNG[] = [];
  for await (const pageBuffer of document) {
    pages.push(PNG.sync.read(Buffer.from(pageBuffer)));
    if (pages.length >= MAX_STITCHED_PAGES) break;
  }
  if (pages.length === 0) throw new Error(`No pages rendered from ${pdfPath}`);
  if (pages.length === 1) {
    await writeFile(outPath, PNG.sync.write(pages[0]!));
    return;
  }

  const width = pages[0]!.width;
  const margin = PAGE_MARGIN_PX; // 1in at harness scale
  const sliceTop = (index: number) => (index === 0 ? 0 : margin);
  const sliceBottom = (index: number) =>
    index === pages.length - 1 ? pages[index]!.height : pages[index]!.height - margin;

  const totalHeight = pages.reduce(
    (sum, _page, index) => sum + (sliceBottom(index) - sliceTop(index)),
    0,
  );
  const stitched = new PNG({ width, height: totalHeight });
  let destY = 0;
  pages.forEach((page, index) => {
    const top = sliceTop(index);
    const sliceHeight = sliceBottom(index) - top;
    PNG.bitblt(page, stitched, 0, top, width, sliceHeight, 0, destY);
    destY += sliceHeight;
  });

  await writeFile(outPath, PNG.sync.write(stitched));
}
