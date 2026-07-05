#!/usr/bin/env node
/**
 * Verify the npm tarball installs and converts without Playwright.
 * Run from repo root: npm run test:pack-smoke
 */
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packOut = execSync("npm pack --silent", { cwd: root, encoding: "utf-8" }).trim();
const tgz = path.join(root, packOut);

const work = mkdtempSync(path.join(tmpdir(), "dom-docx-smoke-"));
try {
  writeFileSync(path.join(work, "package.json"), JSON.stringify({ type: "module", private: true }, null, 2));
  execSync(`npm install "${tgz}"`, { cwd: work, stdio: "inherit" });

  const nm = path.join(work, "node_modules");
  const pkg = JSON.parse(readFileSync(path.join(nm, "dom-docx/package.json"), "utf-8"));
  if (pkg.dependencies?.playwright || pkg.optionalDependencies?.playwright) {
    throw new Error(
      "playwright must not be a hard/optional dependency (use an optional peerDependency so `npm i` stays lean)",
    );
  }
  if (pkg.peerDependencies?.playwright && !pkg.peerDependenciesMeta?.playwright?.optional) {
    throw new Error("playwright peerDependency must be marked optional in peerDependenciesMeta");
  }
  const hasPlaywrightDir = (() => {
    try {
      readFileSync(path.join(nm, "playwright/package.json"));
      return true;
    } catch {
      return false;
    }
  })();
  if (hasPlaywrightDir) {
    throw new Error(
      "playwright was installed into a clean consumer project — an optional peerDependency must NOT auto-install",
    );
  }

  const smoke = `
    import { convertHtmlToDocx } from 'dom-docx';
    import { writeFileSync } from 'fs';
    const buf = await convertHtmlToDocx('<p>pack smoke</p>');
    if (buf[0] !== 0x50 || buf[1] !== 0x4b) throw new Error('not a zip/docx');
    writeFileSync('out.docx', buf);
    console.log('ok:', buf.length, 'bytes');
  `;
  writeFileSync(path.join(work, "smoke.mjs"), smoke);
  execSync("node smoke.mjs", { cwd: work, stdio: "inherit" });

  const out = readFileSync(path.join(work, "out.docx"));
  if (out.length < 100) throw new Error("docx too small");

  // CLI: the bin entry must ship, execute, and convert from the installed tarball.
  writeFileSync(path.join(work, "cli-in.html"), "<h1>CLI smoke</h1><p>via bin</p>");
  execSync("npx --no-install dom-docx cli-in.html -o cli-out.docx", { cwd: work, stdio: "inherit" });
  const cliOut = readFileSync(path.join(work, "cli-out.docx"));
  if (cliOut[0] !== 0x50 || cliOut[1] !== 0x4b) throw new Error("CLI output is not a zip/docx");

  console.log("pack-smoke: passed (library + CLI)");
} finally {
  rmSync(work, { recursive: true, force: true });
  rmSync(tgz, { force: true });
}
