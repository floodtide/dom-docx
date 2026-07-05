import {
  BODY_FONT,
  BODY_FONT_HALF_POINTS,
  PAGE_MARGIN_TWIPS,
} from "../../src/converter/constants.js";

/** Match validator harness: letter page, 1" margins, Arial 14px body. */
export const BENCHMARK_DOCUMENT_OPTIONS = {
  orientation: "portrait" as const,
  pageSize: {
    width: 12240,
    height: 15840,
  },
  margins: {
    top: PAGE_MARGIN_TWIPS,
    right: PAGE_MARGIN_TWIPS,
    bottom: PAGE_MARGIN_TWIPS,
    left: PAGE_MARGIN_TWIPS,
    header: 720,
    footer: 720,
    gutter: 0,
  },
  font: BODY_FONT,
  fontSize: BODY_FONT_HALF_POINTS,
  complexScriptFontSize: BODY_FONT_HALF_POINTS,
  table: {
    row: {
      cantSplit: false,
    },
  },
};
