/** Browser-only: rasterize `<canvas>` and complex `<svg>` (e.g. Highcharts) to `<img>` PNGs. */

const COMPLEX_SVG_TAGS = new Set([
  "path",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "image",
  "use",
  "foreignobject",
  "defs",
  "lineargradient",
  "radialgradient",
  "clippath",
  "mask",
  "filter",
  "marker",
  "symbol",
]);

const SIMPLE_SVG_TAGS = new Set(["svg", "g", "rect", "text", "tspan", "title", "desc"]);

export interface RasterizeInPlaceOptions {
  /**
   * Mutate the caller's `root` instead of cloning. Default false — cloning avoids
   * disturbing a live SPA (Vue/React) while charts are replaced only on the export copy.
   */
  mutate?: boolean;
  /** Extra CSS selectors to rasterize (e.g. `.highcharts-container`). */
  selectors?: string[];
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load rasterized image"));
    img.src = url;
  });
}

/** True when the SVG is simple enough for dom-docx native rect/text conversion. */
export function isSimpleSvgElement(svg: Element): boolean {
  const walk = (el: Element): boolean => {
    const tag = el.tagName.toLowerCase();
    if (COMPLEX_SVG_TAGS.has(tag)) return false;
    if (!SIMPLE_SVG_TAGS.has(tag)) return false;
    for (const child of el.children) {
      if (!walk(child)) return false;
    }
    return true;
  };
  return walk(svg);
}

function elementSize(el: Element): { width: number; height: number } {
  if (el instanceof HTMLElement || el instanceof SVGElement) {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return { width: Math.round(rect.width), height: Math.round(rect.height) };
    }
  }
  const width = Math.max(1, Math.round(parseFloat(el.getAttribute("width") ?? "") || 0));
  const height = Math.max(1, Math.round(parseFloat(el.getAttribute("height") ?? "") || 0));
  if (width > 1 && height > 1) return { width, height };
  if (el instanceof SVGSVGElement && el.viewBox?.baseVal) {
    const vb = el.viewBox.baseVal;
    if (vb.width > 0 && vb.height > 0) return { width: Math.round(vb.width), height: Math.round(vb.height) };
  }
  return { width: 400, height: 300 };
}

function altText(el: Element): string {
  return (
    el.getAttribute("aria-label") ??
    el.getAttribute("alt") ??
    el.querySelector("title")?.textContent?.trim() ??
    "Chart"
  );
}

function replaceWithImage(el: Element, dataUrl: string, width: number, height: number): void {
  const doc = el.ownerDocument;
  const img = doc.createElement("img");
  img.src = dataUrl;
  img.width = width;
  img.height = height;
  img.alt = altText(el);
  el.replaceWith(img);
}

async function rasterizeCanvas(canvas: HTMLCanvasElement): Promise<void> {
  let dataUrl: string;
  try {
    dataUrl = canvas.toDataURL("image/png");
  } catch {
    return;
  }
  if (!dataUrl.startsWith("data:image/png")) return;
  const { width, height } = elementSize(canvas);
  replaceWithImage(canvas, dataUrl, width, height);
}

async function rasterizeSvg(svg: SVGSVGElement): Promise<void> {
  const { width, height } = elementSize(svg);
  const clone = svg.cloneNode(true) as SVGSVGElement;
  if (!clone.getAttribute("xmlns")) {
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  }
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));

  const svgData = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  try {
    const img = await loadImage(url);
    const canvas = svg.ownerDocument.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, width, height);
    replaceWithImage(svg, canvas.toDataURL("image/png"), width, height);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function collectRasterizeTargets(root: Element, options?: RasterizeInPlaceOptions): Element[] {
  const seen = new Set<Element>();
  const targets: Element[] = [];

  const add = (el: Element | null) => {
    if (!el || seen.has(el)) return;
    seen.add(el);
    targets.push(el);
  };

  for (const canvas of root.querySelectorAll("canvas")) add(canvas);

  for (const svg of root.querySelectorAll("svg")) {
    if (!isSimpleSvgElement(svg)) add(svg);
  }

  for (const selector of options?.selectors ?? []) {
    for (const el of root.querySelectorAll(selector)) {
      if (el instanceof HTMLCanvasElement) add(el);
      else if (el instanceof SVGSVGElement && !isSimpleSvgElement(el)) add(el);
      else if (el.querySelector("canvas, svg")) {
        for (const canvas of el.querySelectorAll("canvas")) add(canvas);
        for (const svg of el.querySelectorAll("svg")) {
          if (!isSimpleSvgElement(svg)) add(svg);
        }
      }
    }
  }

  // Deepest first so nested targets are replaced before ancestors.
  targets.sort((a, b) => elementDepth(b) - elementDepth(a));

  return targets;
}

function elementDepth(el: Element): number {
  let depth = 0;
  let parent = el.parentElement;
  while (parent) {
    depth++;
    parent = parent.parentElement;
  }
  return depth;
}

async function rasterizeTargets(root: Element, options?: RasterizeInPlaceOptions): Promise<void> {
  for (const el of collectRasterizeTargets(root, options)) {
    if (el instanceof HTMLCanvasElement) await rasterizeCanvas(el);
    else if (el instanceof SVGSVGElement) await rasterizeSvg(el);
  }
}

export interface PreparedExportRoot {
  root: Element;
  html: string;
  cleanup: () => void;
}

/**
 * Clone (by default) the export root, rasterize charts on the working copy, and return
 * `innerHTML` ready for conversion. The caller's live DOM is left unchanged unless
 * `mutate: true`.
 */
export async function prepareRootForExport(
  root: Element,
  doc: Document,
  options?: RasterizeInPlaceOptions,
): Promise<PreparedExportRoot> {
  if (options?.mutate) {
    await rasterizeTargets(root, options);
    return {
      root,
      html: root.innerHTML,
      cleanup: () => {},
    };
  }

  const host = doc.createElement("div");
  host.setAttribute("data-dom-docx-rasterize-host", "");
  host.style.cssText = "position:fixed;left:-10000px;top:0;width:816px;visibility:hidden;pointer-events:none;";
  const working = root.cloneNode(true) as Element;
  host.appendChild(working);
  doc.body.appendChild(host);

  try {
    await rasterizeTargets(working, options);
    return {
      root: working,
      html: working.innerHTML,
      cleanup: () => host.remove(),
    };
  } catch (err) {
    host.remove();
    throw err;
  }
}

/** Rasterize under `root` in the caller's live DOM. Prefer `convertHtmlToDocx({ rasterizeInPlace: true })` to clone off-screen. */
export async function rasterizeInPlace(
  root: Element,
  options?: RasterizeInPlaceOptions,
): Promise<void> {
  await rasterizeTargets(root, options);
}
