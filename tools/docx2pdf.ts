import { execFile } from "node:child_process";
import { access, rename, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export const LIBREOFFICE_CANDIDATES = [
  "/Applications/LibreOffice.app/Contents/MacOS/soffice",
  "/usr/local/bin/soffice",
  "soffice",
] as const;

/**
 * Isolated LibreOffice profile: when another soffice instance (e.g. the desktop
 * app or a parallel run) holds the default profile lock, `--convert-to` exits 0
 * WITHOUT writing a PDF. A dedicated profile removes the contention.
 */
const LO_PROFILE_DIR = path.join(os.tmpdir(), "dom-docx-lo-profile");

const LO_RETRY_ATTEMPTS = 3;
const LO_RETRY_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function convertWithLibreOffice(
  inputPath: string,
  outputPath: string,
): Promise<boolean> {
  const outDir = path.dirname(outputPath);
  const baseName = path.basename(inputPath, ".docx");
  const generated = path.join(outDir, `${baseName}.pdf`);

  // Remove any previous output first — a stale PDF at the destination must not
  // satisfy the success check when soffice exits 0 without converting.
  await rm(outputPath, { force: true });
  if (generated !== outputPath) await rm(generated, { force: true });

  for (const bin of LIBREOFFICE_CANDIDATES) {
    for (let attempt = 0; attempt < LO_RETRY_ATTEMPTS; attempt++) {
      try {
        await exec(bin, [
          "--headless",
          `-env:UserInstallation=file://${LO_PROFILE_DIR}`,
          "--convert-to",
          "pdf",
          "--outdir",
          outDir,
          inputPath,
        ]);
      } catch (err) {
        // Binary not installed → next candidate; other errors (e.g. profile
        // lock during teardown of the previous run) are retryable.
        if ((err as NodeJS.ErrnoException).code === "ENOENT") break;
      }
      if (await fileExists(generated)) {
        if (generated !== outputPath) await rename(generated, outputPath);
        return true;
      }
      // soffice can exit 0 without converting while the previous invocation's
      // profile lock is still being released — wait and retry.
      await sleep(LO_RETRY_DELAY_MS);
    }
  }
  return false;
}

export async function convertWithWord(inputPath: string, outputPath: string): Promise<boolean> {
  if (process.platform !== "darwin") return false;

  const script = `
    set inFile to POSIX file "${inputPath}"
    set outFile to POSIX file "${outputPath}"
    tell application "Microsoft Word"
      set docRef to open inFile
      save as docRef file format format PDF file name outFile
      close docRef saving no
    end tell
  `;

  try {
    await exec("osascript", ["-e", script]);
    return fileExists(outputPath);
  } catch {
    return false;
  }
}

/** Convert DOCX → PDF via local LibreOffice or Microsoft Word CLI. */
export async function docxToPdf(inputPath: string, outputPath: string): Promise<void> {
  if (await convertWithLibreOffice(inputPath, outputPath)) return;
  if (await convertWithWord(inputPath, outputPath)) return;

  throw new Error(
    "docx→pdf failed: install LibreOffice (soffice) or Microsoft Word",
  );
}
