import { SimpleField, TextRun } from "docx";

/**
 * Allowlisted Word fields for page chrome (header/footer/cover/toc HTML only).
 *
 * Security: caller-supplied `data-docx-field` values select a key in this table;
 * the OOXML instruction string is ALWAYS taken from the table value — never from
 * user input. Reject unknown keys (warn + drop the marker).
 *
 * Out of scope (intentionally omitted):
 * - INCLUDETEXT, INCLUDEPICTURE, LINK, DDE — external references / security prompts
 * - MERGEFIELD, DATABASE, FILLIN, ASK — mail merge / macros
 * - DOCPROPERTY, AUTHOR, TITLE, FILENAME — metadata leakage; use static text
 * - DATE, TIME, CREATEDATE, SAVEDATE — known at convert time; use static text
 *
 * future: STYLEREF (running headers), PAGEREF (cross-ref page numbers) — need args
 */
export const DOCX_FIELD_ALLOWLIST = {
  page: "PAGE",
  pages: "NUMPAGES",
  "section-pages": "SECTIONPAGES",
  section: "SECTION",
} as const;

export type DocxFieldName = keyof typeof DOCX_FIELD_ALLOWLIST;

/** Friendly allowlist names for warnings and docs. */
export const DOCX_FIELD_NAMES = Object.keys(DOCX_FIELD_ALLOWLIST) as DocxFieldName[];

const ALLOWLIST_LOOKUP = new Map<string, string>(
  Object.entries(DOCX_FIELD_ALLOWLIST).map(([name, instruction]) => [name.toLowerCase(), instruction]),
);

/** Map a case-insensitive friendly field name to a hardcoded OOXML instruction, or undefined if denied. */
export function resolveDocxFieldInstruction(friendlyName: string): string | undefined {
  return ALLOWLIST_LOOKUP.get(friendlyName.trim().toLowerCase());
}

/** Cached display value for numeric page fields before the word processor updates them. */
export const DOCX_FIELD_CACHED_VALUE = "1";

/** Sugar: replace `{page}` / `{pages}` with allowlisted marker spans (chrome HTML only). */
export function injectFieldTokens(html: string): string {
  return html
    .replace(/\{page\}/gi, '<span data-docx-field="page"></span>')
    .replace(/\{pages\}/gi, '<span data-docx-field="pages"></span>');
}

/** w:fldSimple with a styled cached-value run; patched to a 5-run complex field post-pack. */
export class StyledDocxField extends SimpleField {
  constructor(instruction: string, cachedRun: TextRun) {
    super(` ${instruction} `);
    this.root.push(cachedRun);
  }
}

export interface InlineFieldOptions {
  /** When true, allowlisted `data-docx-field` markers emit Word fields. */
  enabled?: boolean;
  onWarning?: (message: string) => void;
}

export const DEFAULT_INLINE_FIELD_OPTIONS: InlineFieldOptions = { enabled: false };
