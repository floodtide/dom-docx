import { AlignmentType, LineRuleType, Paragraph, ShadingType, TextRun } from "docx";
import type { AnyNode, Element } from "domhandler";
import { PRINTABLE_CONTENT_WIDTH_TWIPS } from "./constants.js";
import { parseColor, pxToHalfPoints, pxToTwips } from "./css.js";
import type { DocxBlock } from "./types.js";

interface SvgRect {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
}

interface SvgText {
  x: number;
  y: number;
  text: string;
  fill?: string;
  fontPx?: number;
}

function num(value: string | undefined, fallback = 0): number {
  const n = parseFloat(value ?? "");
  return Number.isFinite(n) ? n : fallback;
}

function isElement(node: AnyNode): node is Element {
  return node.type === "tag";
}

function textContent(element: Element): string {
  let out = "";
  for (const child of element.children ?? []) {
    if (child.type === "text") out += child.data ?? "";
    else if (isElement(child)) out += textContent(child);
  }
  return out.replace(/\s+/g, " ").trim();
}

function collect(element: Element, tag: string, into: Element[]): void {
  for (const child of element.children ?? []) {
    if (!isElement(child)) continue;
    if (child.name.toLowerCase() === tag) into.push(child);
    collect(child, tag, into);
  }
}

export function isSvgElement(element: Element): boolean {
  return element.name.toLowerCase() === "svg";
}

/**
 * Low-complexity SVG → native DOCX vector-ish blocks (no rasterization).
 * Supports stacked `<rect>` bars (e.g. funnel/bar charts) rendered as centered
 * shaded paragraph bands, plus `<text>` labels. Painter's-algorithm overlap is
 * resolved so visible band heights match the browser render.
 */
export function convertSvg(svg: Element): DocxBlock[] {
  const viewBox = (svg.attribs?.viewbox ?? "").trim().split(/[\s,]+/).map(Number);
  const hasViewBox = viewBox.length === 4 && viewBox.every((v) => Number.isFinite(v));
  const widthAttr = num(svg.attribs?.width, hasViewBox ? viewBox[2] : 0);
  const vbWidth = hasViewBox ? viewBox[2] : widthAttr;
  // user units → displayed px
  const scale = vbWidth > 0 && widthAttr > 0 ? widthAttr / vbWidth : 1;

  const rectEls: Element[] = [];
  collect(svg, "rect", rectEls);
  const rects: SvgRect[] = rectEls
    .map((r) => ({
      x: num(r.attribs?.x),
      y: num(r.attribs?.y),
      w: num(r.attribs?.width),
      h: num(r.attribs?.height),
      fill: parseColor(r.attribs?.fill) ?? "000000",
    }))
    .filter((r) => r.w > 0 && r.h > 0)
    .sort((a, b) => a.y - b.y);

  const textEls: Element[] = [];
  collect(svg, "text", textEls);
  const texts: SvgText[] = textEls
    .map((t) => ({
      x: num(t.attribs?.x),
      y: num(t.attribs?.y),
      text: textContent(t),
      fill: parseColor(t.attribs?.fill),
      fontPx: t.attribs?.["font-size"] ? num(t.attribs["font-size"]) : undefined,
    }))
    .filter((t) => t.text.length > 0);

  const blocks: DocxBlock[] = [];

  // The SVG is laid out horizontally centered in the content column (figure is
  // text-align:center). Map SVG user-x → page twips through that frame so shapes
  // land at their true position, not merely page-centered.
  const svgWidthTwips = pxToTwips(widthAttr);
  const svgLeftTwips = Math.max(0, Math.round((PRINTABLE_CONTENT_WIDTH_TWIPS - svgWidthTwips) / 2));
  const userToTwips = (userX: number): number => svgLeftTwips + pxToTwips(userX * scale);

  // Bars: shaded bands positioned by exact left/right indent. Visible height
  // resolves stacked overlap so the top-painted (smallest-y) rect keeps full
  // height and lower ones show only their exposed slice — matching how a browser
  // paints later-defined rects on top.
  let prevBottom: number | null = null;
  rects.forEach((rect, i) => {
    const bottom = rect.y + rect.h;
    let bandPx = rect.h;
    if (i > 0 && prevBottom !== null) {
      bandPx = Math.min(rect.h, Math.max(1, bottom - prevBottom));
    }
    prevBottom = bottom;

    const widthTwips = pxToTwips(rect.w * scale);
    const heightTwips = pxToTwips(bandPx * scale);
    const left = userToTwips(rect.x);
    const right = Math.max(0, PRINTABLE_CONTENT_WIDTH_TWIPS - left - widthTwips);

    blocks.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        shading: { type: ShadingType.CLEAR, fill: rect.fill, color: "auto" },
        indent: { left, right },
        spacing: { before: 0, after: 0, line: heightTwips, lineRule: LineRuleType.EXACT },
        children: [new TextRun({ text: "", size: 2 })],
      }),
    );
  });

  // Text labels: positioned at their true user-x via the same frame.
  for (const t of texts) {
    blocks.push(
      new Paragraph({
        indent: { left: userToTwips(t.x) },
        spacing: { before: pxToTwips(2), after: 0 },
        children: [
          new TextRun({
            text: t.text,
            color: t.fill ?? "666666",
            size: t.fontPx ? pxToHalfPoints(t.fontPx) : pxToHalfPoints(11),
          }),
        ],
      }),
    );
  }

  return blocks;
}
