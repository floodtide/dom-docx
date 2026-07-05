import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { SUITE_OUTPUT } from "./output-paths.js";

/**
 * Generate a self-contained hand-labeling page over the suite's side-by-side renders.
 *
 * Purpose: build the human ground-truth set for validating/tuning the layout-fidelity
 * metric (internal/research/visual-scoring-metric-research-2026-07-02.md §8). The page
 * deliberately shows NO scores — the labeler must not be anchored by either metric.
 *
 * Run:   tsx tools/label-renders.ts
 * Then:  open output/suite/labeling.html — rate with keys 1/2/3, arrows to navigate.
 *        Labels persist in localStorage; "Export" downloads human-labels.json →
 *        save it to internal/research/human-labels.json.
 *
 * Case order is shuffled deterministically (seeded) so pixel-vs-layout disagreement
 * cases are not clustered in a recognizable block.
 */

interface LoopResults {
  runAt: string;
  cases: Array<{ name: string }>;
}

/** Deterministic shuffle (mulberry32) so re-generating keeps a stable order. */
function seededShuffle<T>(items: T[], seed: number): T[] {
  let state = seed >>> 0;
  const rand = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function main(): Promise<void> {
  const resultsPath = path.join(SUITE_OUTPUT, "results.json");
  const results: LoopResults = JSON.parse(await readFile(resultsPath, "utf-8"));

  const cases = seededShuffle(
    results.cases
      .map((c) => c.name)
      .filter((name) => existsSync(path.join(SUITE_OUTPUT, name, "compare_side_by_side.png"))),
    20260702,
  );

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>dom-docx render labeling</title>
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; margin: 0; background: #f5f5f5; color: #111; }
  header { position: sticky; top: 0; background: #fff; border-bottom: 1px solid #ddd; padding: 10px 16px; display: flex; align-items: center; gap: 16px; z-index: 2; }
  header h1 { font-size: 15px; margin: 0; }
  #progress { color: #666; font-size: 13px; }
  #casename { font-weight: 600; font-size: 14px; }
  .btns { display: flex; gap: 8px; margin-left: auto; }
  button { font-size: 13px; padding: 6px 12px; border: 1px solid #bbb; border-radius: 6px; background: #fff; cursor: pointer; }
  button:hover { background: #eee; }
  button.active-1 { background: #1a7f37; color: #fff; border-color: #1a7f37; }
  button.active-2 { background: #b58800; color: #fff; border-color: #b58800; }
  button.active-3 { background: #c62828; color: #fff; border-color: #c62828; }
  main { padding: 12px; }
  .hint { color: #888; font-size: 12px; padding: 0 16px 8px; }
  img { width: 100%; background: #fff; border: 1px solid #ddd; border-radius: 4px; }
  .labelrow { display: flex; gap: 8px; align-items: center; padding: 10px 4px; }
  input[type=text] { flex: 1; font-size: 13px; padding: 6px 8px; border: 1px solid #ccc; border-radius: 6px; }
  .legend { font-size: 12px; color: #666; }
</style>
</head>
<body>
<header>
  <h1>Rate the DOCX render (right) vs the HTML reference (left)</h1>
  <span id="progress"></span>
  <span id="casename"></span>
  <div class="btns">
    <button id="b1" onclick="rate(1)">1 · Looks right</button>
    <button id="b2" onclick="rate(2)">2 · Minor issues</button>
    <button id="b3" onclick="rate(3)">3 · Broken</button>
    <button onclick="prev()">←</button>
    <button onclick="next()">→</button>
    <button onclick="exportLabels()">Export JSON</button>
  </div>
</header>
<div class="hint">Keys: <b>1/2/3</b> rate &amp; advance · <b>←/→</b> navigate · judge overall layout/readability, ignore font antialiasing. Notes are optional. Labels autosave to localStorage.</div>
<main>
  <div class="labelrow">
    <span class="legend">Notes (what's off, if anything):</span>
    <input type="text" id="note" placeholder="optional" onchange="saveNote()">
  </div>
  <img id="img" src="" alt="side by side render">
</main>
<script>
const CASES = ${JSON.stringify(cases)};
const KEY = "dom-docx-labels-v1";
let idx = 0;
let labels = JSON.parse(localStorage.getItem(KEY) || "{}");

function firstUnlabeled() {
  const i = CASES.findIndex((c) => !labels[c] || !labels[c].rating);
  return i < 0 ? 0 : i;
}
function render() {
  const name = CASES[idx];
  document.getElementById("img").src = name + "/compare_side_by_side.png";
  document.getElementById("casename").textContent = name;
  const done = CASES.filter((c) => labels[c] && labels[c].rating).length;
  document.getElementById("progress").textContent = (idx + 1) + "/" + CASES.length + " · " + done + " labeled";
  document.getElementById("note").value = (labels[name] && labels[name].note) || "";
  for (const r of [1, 2, 3]) {
    const b = document.getElementById("b" + r);
    b.className = labels[name] && labels[name].rating === r ? "active-" + r : "";
  }
  window.scrollTo(0, 0);
}
function save() { localStorage.setItem(KEY, JSON.stringify(labels)); }
function rate(r) {
  const name = CASES[idx];
  labels[name] = Object.assign({}, labels[name], { rating: r });
  save();
  next();
}
function saveNote() {
  const name = CASES[idx];
  labels[name] = Object.assign({}, labels[name], { note: document.getElementById("note").value });
  save();
  render();
}
function next() { if (idx < CASES.length - 1) idx++; render(); }
function prev() { if (idx > 0) idx--; render(); }
function exportLabels() {
  const payload = {
    version: 1,
    labeledAt: new Date().toISOString(),
    scale: { 1: "looks right", 2: "minor issues", 3: "broken" },
    labels: labels,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "human-labels.json";
  a.click();
}
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;
  if (e.key === "1") rate(1);
  else if (e.key === "2") rate(2);
  else if (e.key === "3") rate(3);
  else if (e.key === "ArrowRight") next();
  else if (e.key === "ArrowLeft") prev();
});
idx = firstUnlabeled();
render();
</script>
</body>
</html>
`;

  const outPath = path.join(SUITE_OUTPUT, "labeling.html");
  await writeFile(outPath, html, "utf-8");
  console.log(`Labeling page: ${outPath} (${cases.length} cases)`);
  console.log("Open it in a browser, rate with 1/2/3, then Export → save as internal/research/human-labels.json");
}

main();
