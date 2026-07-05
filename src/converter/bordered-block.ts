import {
  BorderStyle,
  LineRuleType,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ParagraphChild,
} from "docx";
import { BODY_LINE_BOX_PX, PRINTABLE_CONTENT_WIDTH_TWIPS } from "./constants.js";
import { pxToTwips } from "./css.js";
import { typographyToTextRunOptions } from "./inline.js";
import type { BlockBorders, BlockLayout, DocxBlock, RunTypography } from "./types.js";

function countBorderSides(borders?: BlockBorders): number {
  if (!borders) return 0;
  return [borders.top, borders.right, borders.bottom, borders.left].filter(Boolean).length;
}

const BORDERLESS = { style: BorderStyle.NONE, size: 0, color: "auto" };

function borderlessTableBorders() {
  return {
    top: BORDERLESS,
    bottom: BORDERLESS,
    left: BORDERLESS,
    right: BORDERLESS,
    insideHorizontal: BORDERLESS,
    insideVertical: BORDERLESS,
  };
}

function toCellBorder(side: BlockBorders["top"]) {
  if (!side) return undefined;
  return {
    style: BorderStyle.SINGLE,
    size: side.size,
    color: side.color,
    space: side.space,
  };
}

export function visibleCellBorders(borders?: BlockBorders) {
  if (!borders || countBorderSides(borders) === 0) {
    return {
      top: BORDERLESS,
      bottom: BORDERLESS,
      left: BORDERLESS,
      right: BORDERLESS,
    };
  }
  return {
    top: toCellBorder(borders.top) ?? BORDERLESS,
    right: toCellBorder(borders.right) ?? BORDERLESS,
    bottom: toCellBorder(borders.bottom) ?? BORDERLESS,
    left: toCellBorder(borders.left) ?? BORDERLESS,
  };
}

/** Multi-side borders break OOXML element order on Paragraph — use a table wrapper instead. */
export function shouldUseBorderedTable(layout: BlockLayout): boolean {
  return countBorderSides(layout.borders) >= 2;
}

/** Shaded blocks with borders use a table cell — paragraph border + shading order is fragile. */
export function needsShadedTableWrapper(layout: BlockLayout): boolean {
  return countBorderSides(layout.borders) > 0;
}

/** Inner paragraph for shaded table cells — padding lives in cell margins. */
function makeTableCellInnerParagraph(
  runs: ParagraphChild[],
  layout: BlockLayout,
  typography?: RunTypography,
): Paragraph {
  return new Paragraph({
    ...(layout.indentLeft || layout.indentRight
      ? { indent: { left: layout.indentLeft, right: layout.indentRight } }
      : {}),
    spacing: {
      before: 0,
      after: 0,
      line: pxToTwips(layout.shadedContentLinePx ?? BODY_LINE_BOX_PX),
      lineRule: LineRuleType.EXACT,
    },
    contextualSpacing: false,
    children:
      runs.length > 0
        ? runs
        : [
            new TextRun({
              text: "",
              ...(typography ? typographyToTextRunOptions(typography) : {}),
            }),
          ],
  });
}

export function makeBorderedTableBlock(
  runs: ParagraphChild[],
  layout: BlockLayout,
  typography: RunTypography,
): Table {
  const { borders, shading, ...paragraphLayout } = layout;
  const innerParagraph = makeTableCellInnerParagraph(runs, paragraphLayout, typography);

  return makeShadedContainerTable([innerParagraph], layout, borders);
}

/** Single-border shaded block (e.g. border-left callout) — table cell for fill + border. */
export function makeShadedBlockTable(
  runs: ParagraphChild[],
  layout: BlockLayout,
  typography?: RunTypography,
): Table {
  const innerParagraph = makeTableCellInnerParagraph(
    runs,
    {
      ...layout,
      shading: undefined,
      borders: undefined,
      paddingTop: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      paddingRight: 0,
    },
    typography,
  );
  return makeShadedContainerTable([innerParagraph], layout, layout.borders);
}

/** One cell, borderless table — continuous background for block children inside a shaded `<div>`. */
export function makeShadedContainerTable(
  blocks: DocxBlock[],
  layout: BlockLayout,
  borders?: BlockBorders,
): Table {
  const cellChildren =
    blocks.length > 0 ? blocks : [new Paragraph({ children: [new TextRun("")] })];

  return new Table({
    width: { size: PRINTABLE_CONTENT_WIDTH_TWIPS, type: WidthType.DXA },
    columnWidths: [PRINTABLE_CONTENT_WIDTH_TWIPS],
    layout: "fixed",
    borders: borderlessTableBorders(),
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: PRINTABLE_CONTENT_WIDTH_TWIPS, type: WidthType.DXA },
            borders: visibleCellBorders(borders),
            shading: layout.shading ? { type: ShadingType.CLEAR, ...layout.shading } : undefined,
            margins: {
              top: layout.paddingTop ?? 0,
              bottom: layout.paddingBottom ?? 0,
              left: layout.paddingLeft ?? 0,
              right: layout.paddingRight ?? 0,
            },
            children: cellChildren,
          }),
        ],
      }),
    ],
  });
}
