/**
 * Playwright page.evaluate payload — rasterize charts and return export HTML.
 * Async IIFE: (rootSelector, options, mutate) => { html, snapshotRootSelector, cleanupSelector }
 */
async (rootSelector, options, mutate) => {
  const COMPLEX_SVG_TAGS = new Set([
    "path", "circle", "ellipse", "line", "polyline", "polygon", "image", "use",
    "foreignobject", "defs", "lineargradient", "radialgradient", "clippath", "mask",
    "filter", "marker", "symbol",
  ]);
  const SIMPLE_SVG_TAGS = new Set(["svg", "g", "rect", "text", "tspan", "title", "desc"]);

  const isSimpleSvgElement = (svg) => {
    const walk = (el) => {
      const tag = el.tagName.toLowerCase();
      if (COMPLEX_SVG_TAGS.has(tag)) return false;
      if (!SIMPLE_SVG_TAGS.has(tag)) return false;
      for (const child of el.children) {
        if (!walk(child)) return false;
      }
      return true;
    };
    return walk(svg);
  };

  const elementDepth = (el) => {
    let depth = 0;
    let parent = el.parentElement;
    while (parent) {
      depth++;
      parent = parent.parentElement;
    }
    return depth;
  };

  const elementSize = (el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return { width: Math.round(rect.width), height: Math.round(rect.height) };
    }
    const width = Math.max(1, Math.round(parseFloat(el.getAttribute("width") || "") || 0));
    const height = Math.max(1, Math.round(parseFloat(el.getAttribute("height") || "") || 0));
    if (width > 1 && height > 1) return { width, height };
    if (el instanceof SVGSVGElement && el.viewBox && el.viewBox.baseVal) {
      const vb = el.viewBox.baseVal;
      if (vb.width > 0 && vb.height > 0) {
        return { width: Math.round(vb.width), height: Math.round(vb.height) };
      }
    }
    return { width: 400, height: 300 };
  };

  const altText = (el) =>
    el.getAttribute("aria-label") ||
    el.getAttribute("alt") ||
    (el.querySelector("title") && el.querySelector("title").textContent.trim()) ||
    "Chart";

  const resolveRasterScale = () => {
    const scale = (options && options.scale) || 1;
    if (!Number.isFinite(scale) || scale < 1) return 1;
    return Math.min(scale, 4);
  };

  const replaceWithImage = (el, dataUrl, width, height) => {
    const img = el.ownerDocument.createElement("img");
    img.src = dataUrl;
    img.width = width;
    img.height = height;
    img.alt = altText(el);
    el.replaceWith(img);
  };

  const loadImage = (url) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load rasterized image"));
      img.src = url;
    });

  const rasterizeCanvas = async (canvas) => {
    const size = elementSize(canvas);
    const scale = resolveRasterScale();
    let dataUrl;
    try {
      if (scale <= 1) {
        dataUrl = canvas.toDataURL("image/png");
      } else {
        const out = canvas.ownerDocument.createElement("canvas");
        out.width = Math.round(size.width * scale);
        out.height = Math.round(size.height * scale);
        const ctx = out.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(canvas, 0, 0, out.width, out.height);
        dataUrl = out.toDataURL("image/png");
      }
    } catch {
      return;
    }
    if (!dataUrl.startsWith("data:image/png")) return;
    replaceWithImage(canvas, dataUrl, size.width, size.height);
  };

  const rasterizeSvg = async (svg) => {
    const size = elementSize(svg);
    const scale = resolveRasterScale();
    const renderW = Math.round(size.width * scale);
    const renderH = Math.round(size.height * scale);
    const clone = svg.cloneNode(true);
    if (!clone.getAttribute("xmlns")) {
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    }
    clone.setAttribute("width", String(renderW));
    clone.setAttribute("height", String(renderH));
    const svgData = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    try {
      const img = await loadImage(url);
      const canvas = svg.ownerDocument.createElement("canvas");
      canvas.width = renderW;
      canvas.height = renderH;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, renderW, renderH);
      replaceWithImage(svg, canvas.toDataURL("image/png"), size.width, size.height);
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const collectRasterizeTargets = (root) => {
    const seen = new Set();
    const targets = [];
    const add = (el) => {
      if (!el || seen.has(el)) return;
      seen.add(el);
      targets.push(el);
    };
    for (const canvas of root.querySelectorAll("canvas")) add(canvas);
    for (const svg of root.querySelectorAll("svg")) {
      if (!isSimpleSvgElement(svg)) add(svg);
    }
    for (const selector of (options && options.selectors) || []) {
      for (const el of root.querySelectorAll(selector)) {
        if (el instanceof HTMLCanvasElement) add(el);
        else if (el instanceof SVGSVGElement && !isSimpleSvgElement(el)) add(el);
        else {
          for (const canvas of el.querySelectorAll("canvas")) add(canvas);
          for (const svg of el.querySelectorAll("svg")) {
            if (!isSimpleSvgElement(svg)) add(svg);
          }
        }
      }
    }
    targets.sort((a, b) => elementDepth(b) - elementDepth(a));
    return targets;
  };

  const rasterizeTargets = async (root) => {
    for (const el of collectRasterizeTargets(root)) {
      if (el instanceof HTMLCanvasElement) await rasterizeCanvas(el);
      else if (el instanceof SVGSVGElement) await rasterizeSvg(el);
    }
  };

  const root = rootSelector ? document.querySelector(rootSelector) : document.body;
  if (!root) {
    throw new Error("dom-docx: export root not found" + (rootSelector ? ": " + rootSelector : ""));
  }

  if (mutate) {
    await rasterizeTargets(root);
    return {
      html: root.innerHTML,
      snapshotRootSelector: rootSelector,
      cleanupSelector: null,
    };
  }

  const host = document.createElement("div");
  host.setAttribute("data-dom-docx-rasterize-host", "");
  host.style.cssText =
    "position:fixed;left:-10000px;top:0;width:816px;visibility:hidden;pointer-events:none;";
  const working = root.cloneNode(true);
  working.setAttribute("data-dom-docx-export-root", "");
  host.appendChild(working);
  document.body.appendChild(host);

  await rasterizeTargets(working);
  return {
    html: working.innerHTML,
    snapshotRootSelector: "[data-dom-docx-rasterize-host] [data-dom-docx-export-root]",
    cleanupSelector: "[data-dom-docx-rasterize-host]",
  };
}
