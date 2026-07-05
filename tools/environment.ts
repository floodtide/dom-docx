import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { Browser } from "playwright";
import { LIBREOFFICE_CANDIDATES } from "./docx2pdf.js";

const exec = promisify(execFile);
const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Renderer + toolchain versions captured into results JSON so historical scores
 * stay interpretable — a LibreOffice or Chromium upgrade shifts scores without
 * any converter change.
 */
export interface HarnessEnvironment {
  platform: string;
  arch: string;
  node: string;
  chromium: string | null;
  libreoffice: string | null;
  packages: Record<string, string | null>;
}

const TRACKED_PACKAGES = ["docx", "cheerio", "playwright", "pdf-to-img", "pdfjs-dist", "pixelmatch"];

function packageVersion(name: string): string | null {
  try {
    return (require(`${name}/package.json`) as { version?: string }).version ?? null;
  } catch {
    // exports map blocks ./package.json (e.g. docx, pdf-to-img) — walk up to node_modules.
  }

  for (let dir = __dirname; dir !== path.dirname(dir); dir = path.dirname(dir)) {
    const pkgPath = path.join(dir, "node_modules", name, "package.json");
    if (!existsSync(pkgPath)) continue;
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version?: string };
      return pkg.version ?? null;
    } catch {
      return null;
    }
  }
  return null;
}

async function libreOfficeVersion(): Promise<string | null> {
  for (const bin of LIBREOFFICE_CANDIDATES) {
    try {
      const { stdout } = await exec(bin, ["--version"]);
      const line = stdout.trim().split("\n")[0]?.trim();
      if (line) return line;
    } catch {
      // try next binary
    }
  }
  return null;
}

export async function captureEnvironment(browser?: Browser): Promise<HarnessEnvironment> {
  const packages: Record<string, string | null> = {};
  for (const name of TRACKED_PACKAGES) {
    packages[name] = packageVersion(name);
  }

  return {
    platform: process.platform,
    arch: process.arch,
    node: process.versions.node,
    chromium: browser ? browser.version() : null,
    libreoffice: await libreOfficeVersion(),
    packages,
  };
}
