import * as esbuild from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outdir = path.join(root, "dist/browser");

await mkdir(outdir, { recursive: true });

const shared = {
  bundle: true,
  platform: "browser",
  target: ["es2022"],
  format: "iife",
  logLevel: "info",
  define: {
    "process.env.NODE_ENV": '"production"',
  },
  mainFields: ["browser", "module", "main"],
};

await esbuild.build({
  ...shared,
  entryPoints: [path.join(root, "src/browser.ts")],
  outfile: path.join(outdir, "dom-docx.browser.js"),
  globalName: "domDocx",
  minify: false,
  sourcemap: true,
});

await copyFile(
  path.join(root, "src/browser.d.ts"),
  path.join(root, "dist/browser.d.ts"),
);

console.error("browser bundle → dist/browser/dom-docx.browser.js");
