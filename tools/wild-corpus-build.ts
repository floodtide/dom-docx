/**
 * Build the wild-HTML corpus: fetch real-world pages and extract sanitized,
 * roughly one-page fragments into `internal/wild-corpus/<case>/fragment.html`.
 *
 * Purpose: launch-readiness testing on HTML the converter was NOT tuned on —
 * email templates (inline CSS), legacy table layouts, encyclopedic tables,
 * book prose, spec text, rendered markdown. Run `tsx tools/wild-runner.ts`
 * afterwards to score the corpus and produce a labeling page.
 *
 * Third-party content stays under gitignored `internal/` — local testing only.
 *
 * Run: tsx tools/wild-corpus-build.ts [--refetch]
 * Cached raw pages live in internal/wild-corpus/.raw/; --refetch re-downloads.
 */
import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const WILD_CORPUS_DIR = path.join(REPO_ROOT, "internal", "wild-corpus");
const RAW_DIR = path.join(WILD_CORPUS_DIR, ".raw");

interface WildSource {
  name: string;
  url: string;
  /** Fetch override (e.g. API endpoint returning HTML). */
  fetchUrl?: string;
  fetchHeaders?: Record<string, string>;
  title: string;
  description: string;
  /** Content root selector candidates (first match wins); default body. */
  root?: string;
  /** Serialized fragment byte cap (whole top-level nodes kept). */
  maxBytes?: number;
  /** Extra selectors to remove for this source. */
  drop?: string;
  /** Skip leading top-level children until this selector matches. */
  startAt?: string;
}

const SOURCES: WildSource[] = [
  {
    name: "wikipedia-ooxml",
    url: "https://en.wikipedia.org/wiki/Office_Open_XML",
    fetchUrl: "https://en.wikipedia.org/api/rest_v1/page/html/Office_Open_XML",
    title: "Wikipedia: Office Open XML",
    description: "Encyclopedic article — infobox table, dense paragraphs, reference sups.",
    drop: ".mw-editsection, [typeof*='mw:File']",
    maxBytes: 11000,
  },
  {
    name: "wikipedia-nutrition-label",
    url: "https://en.wikipedia.org/wiki/Nutrition_facts_label",
    fetchUrl: "https://en.wikipedia.org/api/rest_v1/page/html/Nutrition_facts_label",
    title: "Wikipedia: Nutrition facts label",
    description: "Article with data tables and nested lists.",
    drop: ".mw-editsection, [typeof*='mw:File']",
    maxBytes: 11000,
  },
  {
    name: "email-onboarding",
    url: "https://github.com/leemunroe/responsive-html-email-template",
    fetchUrl:
      "https://raw.githubusercontent.com/leemunroe/responsive-html-email-template/master/email.html",
    title: "Lee Munroe responsive email template",
    description: "Classic transactional email — nested layout tables, all-inline CSS.",
    maxBytes: 16000,
  },
  {
    name: "email-cerberus-hybrid",
    url: "https://github.com/TedGoas/Cerberus",
    fetchUrl: "https://raw.githubusercontent.com/TedGoas/Cerberus/main/cerberus-hybrid.html",
    title: "Cerberus hybrid email template",
    description: "Production email framework — MSO conditionals, ghost tables, inline CSS.",
    maxBytes: 16000,
  },
  {
    name: "hn-thread",
    url: "https://news.ycombinator.com/item?id=1",
    title: "Hacker News item page",
    description: "1990s-style layout tables, font-size tricks, minimal semantics.",
    maxBytes: 12000,
  },
  {
    name: "rfc-2324",
    url: "https://www.rfc-editor.org/rfc/rfc2324.html",
    title: "RFC 2324 (HTCPCP)",
    description: "IETF RFC — pre-formatted spec text, definition-style sections.",
    maxBytes: 10000,
  },
  {
    name: "gutenberg-frankenstein",
    url: "https://www.gutenberg.org/ebooks/84",
    fetchUrl: "https://www.gutenberg.org/cache/epub/84/pg84-images.html",
    title: "Project Gutenberg: Frankenstein (excerpt)",
    description: "Public-domain book prose — headings, italic runs, long paragraphs.",
    startAt: "h2:has(#letter1)",
    maxBytes: 9000,
  },
  {
    name: "github-readme-express",
    url: "https://github.com/expressjs/express",
    fetchUrl: "https://api.github.com/repos/expressjs/express/readme",
    fetchHeaders: { Accept: "application/vnd.github.html" },
    title: "Express.js README (rendered)",
    description: "GitHub-rendered markdown — code blocks, lists, badges stripped.",
    maxBytes: 10000,
  },
  {
    name: "mdn-table-docs",
    url: "https://developer.mozilla.org/en-US/docs/Web/HTML/Element/table",
    title: "MDN: <table> element",
    description: "Modern docs site — example tables, code snippets, note callouts.",
    root: "main article, main, article",
    drop: "mdn-survey, details, .layout__header",
    maxBytes: 11000,
  },
  {
    name: "cnn-lite",
    url: "https://lite.cnn.com/",
    title: "CNN lite front page",
    description: "Text-only news index — headline link list.",
    root: ".container_lead-plus-headlines--lite, body",
    maxBytes: 8000,
  },
  {
    name: "craigslist-factsheet",
    url: "https://www.craigslist.org/about/factsheet",
    title: "Craigslist factsheet",
    description: "Minimal semantic page — definition-style rows.",
    maxBytes: 8000,
  },
];

const STRIP_SELECTOR = [
  "script", "style", "link", "meta", "noscript", "template", "iframe", "svg",
  "video", "audio", "canvas", "form", "input", "button", "select", "textarea",
  "img", "picture", "source", "figure", "nav", "footer",
].join(", ");

async function fetchRaw(source: WildSource, refetch: boolean): Promise<string> {
  const rawPath = path.join(RAW_DIR, `${source.name}.html`);
  if (!refetch && existsSync(rawPath)) return readFile(rawPath, "utf-8");

  const url = source.fetchUrl ?? source.url;
  const response = await fetch(url, {
    headers: { "user-agent": "dom-docx-wild-corpus/0.1 (local fidelity testing)", ...source.fetchHeaders },
  });
  if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`);
  const html = await response.text();
  await writeFile(rawPath, html, "utf-8");
  return html;
}

function removeComments($: cheerio.CheerioAPI): void {
  const removeIn = (nodes: AnyNode[]): void => {
    for (const node of [...nodes]) {
      if (node.type === "comment") $(node).remove();
      else if ("children" in node && node.children) removeIn(node.children as AnyNode[]);
    }
  };
  removeIn($.root().toArray()[0]?.children ?? []);
}

function extractFragment(source: WildSource, rawHtml: string): string {
  const $ = cheerio.load(rawHtml);

  $(STRIP_SELECTOR).remove();
  if (source.drop) $(source.drop).remove();
  removeComments($);

  $("*").each((_, el) => {
    if (el.type !== "tag") return;
    for (const attr of Object.keys(el.attribs ?? {})) {
      if (/^on/i.test(attr) || attr === "srcset" || attr === "data-src") $(el).removeAttr(attr);
    }
  });

  let container: cheerio.Cheerio<AnyNode> = $("body");
  if (source.root) {
    for (const sel of source.root.split(",")) {
      const found = $(sel.trim()).first();
      if (found.length) {
        container = found;
        break;
      }
    }
  }
  if (!container.length) container = $.root() as unknown as typeof container;

  const cap = source.maxBytes ?? 12000;
  const parts: string[] = [];
  let bytes = 0;
  let full = false;

  // Whole nodes that fit are kept; an oversized node is descended into (one
  // page of a wrapper div's leading children beats skipping it entirely).
  const collect = (node: AnyNode): void => {
    if (full) return;
    const html = $.html(node) ?? "";
    if (!html.trim()) return;
    if (bytes + html.length <= cap) {
      parts.push(html);
      bytes += html.length;
      return;
    }
    const children = "children" in node ? ((node.children ?? []) as AnyNode[]) : [];
    const blockChildren = children.filter((c) => c.type === "tag");
    if (blockChildren.length === 0) {
      full = true;
      return;
    }
    for (const child of blockChildren) collect(child);
    full = true;
  };

  // startAt may match at any depth — walk from the first match through its
  // following siblings; otherwise walk the container's direct children.
  let walkNodes: AnyNode[];
  if (source.startAt) {
    const startEl = $(source.startAt).first();
    walkNodes = startEl.length
      ? [startEl.toArray()[0]!, ...startEl.nextAll().toArray()]
      : [];
  } else {
    walkNodes = container.children().toArray();
  }

  for (const child of walkNodes) {
    collect(child);
    if (full) break;
  }

  return parts.join("\n").trim();
}

export async function buildWildCorpus(): Promise<void> {
  const refetch = process.argv.includes("--refetch");
  await mkdir(RAW_DIR, { recursive: true });

  for (const source of SOURCES) {
    try {
      const raw = await fetchRaw(source, refetch);
      const fragment = extractFragment(source, raw);
      if (!fragment) {
        console.error(`  [✗] ${source.name}: empty fragment — check root selector`);
        continue;
      }
      const dir = path.join(WILD_CORPUS_DIR, source.name);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, "fragment.html"), fragment, "utf-8");
      await writeFile(
        path.join(dir, "meta.json"),
        `${JSON.stringify(
          {
            name: source.name,
            title: source.title,
            url: source.url,
            description: source.description,
            fetchedAt: new Date().toISOString().slice(0, 10),
            note: "Third-party content for local fidelity testing only — not for redistribution (internal/ is gitignored).",
          },
          null,
          2,
        )}\n`,
        "utf-8",
      );
      console.log(`  [✓] ${source.name}: ${fragment.length} bytes`);
    } catch (err) {
      console.error(`  [✗] ${source.name}: ${err instanceof Error ? err.message : err}`);
    }
  }
}

// Run only when invoked directly (importers just want WILD_CORPUS_DIR).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildWildCorpus();
}
