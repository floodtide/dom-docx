/** Seeded procedural HTML generator — cases outside the fixed regression fixtures. */

export interface NovelHtmlCase {
  name: string;
  seed: number;
  html: string;
}

export interface NovelGeneratorOptions {
  /** Base seed; each case uses seed + index. */
  seed?: number;
  count?: number;
}

/** Mulberry32 — small deterministic PRNG. */
export class SeededRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length - 1)]!;
  }

  bool(p = 0.5): boolean {
    return this.next() < p;
  }

  shuffle<T>(items: T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    }
    return copy;
  }
}

const WORDS = [
  "alpha",
  "bravo",
  "charlie",
  "delta",
  "echo",
  "foxtrot",
  "golf",
  "hotel",
  "india",
  "juliet",
  "kilo",
  "lima",
  "mercury",
  "neptune",
  "orbit",
  "pluto",
  "quartz",
  "rocket",
  "saturn",
  "titan",
  "umbra",
  "vector",
  "widget",
  "xenon",
  "yonder",
  "zenith",
];

const COLORS = [
  "#111111",
  "#333333",
  "#666666",
  "#1a1a2e",
  "#2a9d8f",
  "#e76f51",
  "#457b9d",
  "#f1faee",
  "#f5f5f5",
  "#eaeaea",
  "#dddddd",
  "#cccccc",
  "#cfc",
  "#ccf",
  "#fcc",
  "#ff0",
];

const HIGHLIGHTS = ["#cfc", "#ccf", "#fcc", "#ff0", "#eaeaea"];

function words(rng: SeededRng, count: number): string {
  return Array.from({ length: count }, () => rng.pick(WORDS)).join(" ");
}

function sentence(rng: SeededRng): string {
  return `${words(rng, rng.int(3, 8))}.`;
}

function inlineContent(rng: SeededRng): string {
  const parts: string[] = [];
  const chunkCount = rng.int(1, 4);
  for (let i = 0; i < chunkCount; i++) {
    const mode = rng.pick(["plain", "strong", "em", "highlight", "link", "code"] as const);
    const text = words(rng, rng.int(1, 4));
    switch (mode) {
      case "strong":
        parts.push(`<strong>${text}</strong>`);
        break;
      case "em":
        parts.push(`<em>${text}</em>`);
        break;
      case "highlight":
        parts.push(`<span style="background:${rng.pick(HIGHLIGHTS)}">${text}</span>`);
        break;
      case "link":
        parts.push(`<a href="https://example.com/${text}">${text}</a>`);
        break;
      case "code":
        parts.push(`<code>${text.replace(/\s/g, "_")}</code>`);
        break;
      default:
        parts.push(text);
    }
  }
  return parts.join(" ");
}

function paragraph(rng: SeededRng): string {
  const align = rng.bool(0.25) ? ` style="text-align:${rng.pick(["center", "right"] as const)}"` : "";
  return `<p${align}>${inlineContent(rng)}</p>`;
}

function heading(rng: SeededRng): string {
  const tag = rng.pick(["h1", "h2", "h3"] as const);
  const color = rng.bool(0.4) ? ` style="color:${rng.pick(COLORS)}"` : "";
  return `<${tag}${color}>${words(rng, rng.int(2, 5))}</${tag}>`;
}

function list(rng: SeededRng): string {
  const tag = rng.pick(["ul", "ol"] as const);
  const items = Array.from({ length: rng.int(2, 5) }, () => `<li>${inlineContent(rng)}</li>`);
  return `<${tag}>${items.join("")}</${tag}>`;
}

function table(rng: SeededRng): string {
  const cols = rng.int(2, 4);
  const rows = rng.int(2, 5);
  const lines: string[] = [
    `<table border="1" cellpadding="${rng.pick([4, 6, 8])}" style="border-collapse:collapse;width:100%">`,
  ];

  for (let r = 0; r < rows; r++) {
    const rowStyle =
      r === 0 && rng.bool(0.5)
        ? ` style="background:${rng.pick(COLORS)};color:${rng.pick(COLORS)}"`
        : rng.bool(0.2)
          ? ` style="background:${rng.pick(COLORS)}"`
          : "";
    const cells: string[] = [];
    for (let c = 0; c < cols; c++) {
      const cellAlign = c > 0 && rng.bool(0.6) ? ' style="text-align:right"' : "";
      const label =
        r === 0
          ? `<strong>${words(rng, rng.int(1, 2))}</strong>`
          : rng.bool(0.3)
            ? `<strong>${words(rng, rng.int(1, 3))}</strong>`
            : words(rng, rng.int(1, 4));
      cells.push(`<td${cellAlign}>${label}</td>`);
    }
    lines.push(`<tr${rowStyle}>${cells.join("")}</tr>`);
  }

  lines.push("</table>");
  return lines.join("");
}

function shadedBlock(rng: SeededRng): string {
  const bg = rng.pick(COLORS);
  const pad = rng.int(4, 12);
  return `<div style="background:${bg};padding:${pad}px;margin:${rng.int(4, 12)}px 0">${inlineContent(rng)}</div>`;
}

function flexBlock(rng: SeededRng): string {
  const direction = rng.pick(["row", "column"] as const);
  const gap = rng.pick([0, 4, 8, 10, 12]);
  const items = Array.from({ length: rng.int(2, 4) }, () => {
    const bg = rng.pick(COLORS);
    return `<div style="background:${bg};padding:${rng.int(4, 10)}px;color:${rng.pick(COLORS)}">${words(rng, rng.int(1, 3))}</div>`;
  });
  return `<div style="display:flex;flex-direction:${direction};gap:${gap}px">${items.join("")}</div>`;
}

function blockquote(rng: SeededRng): string {
  return `<blockquote style="border-left:4px solid #333;padding-left:12px;margin:8px 0">${sentence(rng)} ${inlineContent(rng)}</blockquote>`;
}

function block(rng: SeededRng, depth: number): string {
  if (depth <= 0) return paragraph(rng);
  const kind = rng.pick([
    "paragraph",
    "heading",
    "list",
    "table",
    "shaded",
    "flex",
    "blockquote",
    "hr",
  ] as const);
  switch (kind) {
    case "heading":
      return heading(rng);
    case "list":
      return list(rng);
    case "table":
      return table(rng);
    case "shaded":
      return shadedBlock(rng);
    case "flex":
      return flexBlock(rng);
    case "blockquote":
      return blockquote(rng);
    case "hr":
      return "<hr>";
    default:
      return paragraph(rng);
  }
}

export function generateNovelHtmlCase(seed: number, index: number): NovelHtmlCase {
  const rng = new SeededRng(seed + index * 9973);
  const blockCount = rng.int(3, 8);
  const parts: string[] = [];

  for (let i = 0; i < blockCount; i++) {
    parts.push(block(rng, rng.int(0, 1)));
  }

  return {
    name: `novel-${seed}-case-${String(index + 1).padStart(2, "0")}`,
    seed: seed + index,
    html: parts.join("\n"),
  };
}

export function generateNovelHtmlCases(options: NovelGeneratorOptions = {}): NovelHtmlCase[] {
  const seed = options.seed ?? 42;
  const count = options.count ?? 20;
  return Array.from({ length: count }, (_, index) => generateNovelHtmlCase(seed, index));
}
