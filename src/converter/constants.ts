import {
  AlignmentType,
  convertInchesToTwip,
  HeadingLevel,
  LevelFormat,
  LevelSuffix,
  type INumberingOptions,
} from "docx";

/** Match validator viewport: 1 inch page margins (1440 dxa). */
export const PAGE_MARGIN_TWIPS = convertInchesToTwip(1);

/** 1 inch at 96 DPI — pairs with PAGE_MARGIN_TWIPS in the HTML harness. */
export const PAGE_MARGIN_PX = 96;

/** Letter page at 96 DPI (8.5" × 11") — matches Playwright viewport and docx page size. */
export const VIEWPORT_WIDTH_PX = 816;
export const VIEWPORT_HEIGHT_PX = 1056;

/** Printable content width: 12240 page width − 2880 total margins = 9360 dxa (6.5"). */
export const PRINTABLE_CONTENT_WIDTH_TWIPS = 9360;

/** Validator body font is 14px → 10.5pt → 21 half-points. */
export const BODY_FONT_HALF_POINTS = 21;

/** Chromium default unvisited link color (`:link` in HTML harness). */
export const HYPERLINK_COLOR = "0000EE";

/** Matches the HTML harness body font (validator.ts wrapHtml). */
export const BODY_FONT = "Arial";

/** Validator line-height: 1.4 → 14px × 1.4 = 19.6px line box. */
export const BODY_LINE_HEIGHT = 336;

/** Browser default `<p>` margin is 1em at the harness body font size (14px). */
export const DEFAULT_PARAGRAPH_MARGIN_PX = 14;

/** Blockquote vertical margin (1em at 14px body font in the HTML harness). */
export const BLOCKQUOTE_MARGIN_PX = 14;

/** Blockquote horizontal indent per nesting level (HTML padding-left: 12px). */
export const BLOCKQUOTE_INDENT_PX = 12;

/** Chromium UA default blockquote side margin (margin: 1em 40px). */
export const BLOCKQUOTE_UA_SIDE_MARGIN_PX = 40;

/** Chromium default `<ol>`/`<ul>`: padding-left 40px, text start at 40px from list edge. */
export const LIST_LEVEL_LEFT_TWIPS = 600;
/** Hanging indent: marker column ~20px when text starts at 40px (14px font, decimal markers). */
export const LIST_HANGING_TWIPS = 300;

/** HTML harness line box height in px (matches line-height: 1.4 on 14px font). */
export const BODY_LINE_BOX_PX = 19.6;

/** EXACT `w:spacing/@w:line` in twips — CSS line box, not Word AUTO multiplier. */
export const BODY_LINE_EXACT_TWIPS = Math.round(BODY_LINE_BOX_PX * 15);

export const HEADING_LEVELS = {
  h1: HeadingLevel.HEADING_1,
  h2: HeadingLevel.HEADING_2,
  h3: HeadingLevel.HEADING_3,
  h4: HeadingLevel.HEADING_4,
  h5: HeadingLevel.HEADING_5,
  h6: HeadingLevel.HEADING_6,
} as const;

/** Font sizes in half-points — match Chromium UA defaults at 14px body (2em, 1.5em, …). */
export const HEADING_FONT_HALF_POINTS: Record<keyof typeof HEADING_LEVELS, number> = {
  h1: 42,
  h2: 32,
  h3: 25,
  h4: 24,
  h5: 20,
  h6: 18,
};

/** Chromium UA heading vertical margins as a fraction of heading font size (inline path). */
export const HEADING_MARGIN_EM: Record<keyof typeof HEADING_LEVELS, number> = {
  h1: 0.67,
  h2: 0.83,
  h3: 1,
  h4: 1.33,
  h5: 1.67,
  h6: 2.33,
};

export const BLOCK_TAGS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "center",
  "div",
  "dl",
  "dt",
  "dd",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "svg",
  "table",
  "tbody",
  "thead",
  "tfoot",
  "tr",
  "td",
  "th",
  "ul",
]);

function listLevelParagraphStyle(level: number) {
  const left = LIST_LEVEL_LEFT_TWIPS * (level + 1);
  return {
    indent: {
      left,
      hanging: LIST_HANGING_TWIPS,
    },
    leftTabStop: left,
  };
}

const LIST_LEVELS = [0, 1, 2, 3, 4] as const;

function listLevel(
  level: number,
  format: (typeof LevelFormat)[keyof typeof LevelFormat],
  text: string,
) {
  return {
    level,
    format,
    text,
    alignment: AlignmentType.LEFT,
    suffix: LevelSuffix.TAB,
    style: {
      paragraph: listLevelParagraphStyle(level),
      run: { font: BODY_FONT, size: BODY_FONT_HALF_POINTS },
    },
  };
}

/** Ordered list: same numeric format at every nesting level, `%n.` text. */
function numberedConfig(reference: string, format: (typeof LevelFormat)[keyof typeof LevelFormat]) {
  return { reference, levels: LIST_LEVELS.map((l) => listLevel(l, format, `%${l + 1}.`)) };
}

/** Unordered list: fixed glyph at every level. */
function bulletConfig(reference: string, glyph: string) {
  return { reference, levels: LIST_LEVELS.map((l) => listLevel(l, LevelFormat.BULLET, glyph)) };
}

/** Maps a CSS `list-style-type` to its numbering reference (see `LIST_STYLE_REFERENCES`). */
export const LIST_STYLE_REFERENCES: Record<string, string> = {
  // ordered
  decimal: "numbers",
  "lower-alpha": "numbers-lower-alpha",
  "lower-latin": "numbers-lower-alpha",
  "upper-alpha": "numbers-upper-alpha",
  "upper-latin": "numbers-upper-alpha",
  "lower-roman": "numbers-lower-roman",
  "upper-roman": "numbers-upper-roman",
  // unordered
  disc: "bullets",
  circle: "bullets-circle",
  square: "bullets-square",
};

export const NUMBERING_CONFIG: INumberingOptions = {
  config: [
    {
      reference: "bullets",
      levels: LIST_LEVELS.map((level) =>
        listLevel(level, LevelFormat.BULLET, level % 2 === 0 ? "•" : "◦"),
      ),
    },
    numberedConfig("numbers", LevelFormat.DECIMAL),
    numberedConfig("numbers-lower-alpha", LevelFormat.LOWER_LETTER),
    numberedConfig("numbers-upper-alpha", LevelFormat.UPPER_LETTER),
    numberedConfig("numbers-lower-roman", LevelFormat.LOWER_ROMAN),
    numberedConfig("numbers-upper-roman", LevelFormat.UPPER_ROMAN),
    bulletConfig("bullets-circle", "◦"),
    bulletConfig("bullets-square", "▪"),
  ],
};
