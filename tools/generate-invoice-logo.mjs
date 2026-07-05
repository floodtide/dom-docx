/** Generate a simple brand mark for the invoice showcase (Meridian Analytics). */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.resolve(__dirname, "../examples/invoice/logo.png");

const W = 168;
const H = 48;

function setPixel(png, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const idx = (png.width * y + x) << 2;
  png.data[idx] = r;
  png.data[idx + 1] = g;
  png.data[idx + 2] = b;
  png.data[idx + 3] = a;
}

function fillRect(png, x0, y0, x1, y1, r, g, b) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) setPixel(png, x, y, r, g, b);
  }
}

const png = new PNG({ width: W, height: H });

const navy = [29, 53, 87];
const teal = [69, 123, 157];
const white = [255, 255, 255];

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const radius = 6;
    const inCorner =
      (x < radius && y < radius && (x - radius) ** 2 + (y - radius) ** 2 > radius ** 2) ||
      (x >= W - radius && y < radius && (x - (W - radius - 1)) ** 2 + (y - radius) ** 2 > radius ** 2) ||
      (x < radius && y >= H - radius && (x - radius) ** 2 + (y - (H - radius - 1)) ** 2 > radius ** 2) ||
      (x >= W - radius &&
        y >= H - radius &&
        (x - (W - radius - 1)) ** 2 + (y - (H - radius - 1)) ** 2 > radius ** 2);
    if (inCorner) setPixel(png, x, y, 0, 0, 0, 0);
    else setPixel(png, x, y, ...navy);
  }
}

fillRect(png, 0, H - 5, W - 1, H - 1, ...teal);
fillRect(png, 18, 12, 24, 34, ...white);
fillRect(png, 42, 12, 48, 34, ...white);
fillRect(png, 66, 12, 72, 34, ...white);
fillRect(png, 24, 12, 66, 18, ...white);
fillRect(png, 42, 18, 48, 26, ...white);
fillRect(png, 88, 18, 150, 22, ...white);
fillRect(png, 88, 26, 132, 29, ...teal);

writeFileSync(outPath, PNG.sync.write(png));
console.log(`Wrote ${outPath}`);
