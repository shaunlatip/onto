// Rasterize src/app/icon.svg into the fallbacks Next serves alongside it:
//   src/app/favicon.ico    16/32/64 — for browsers without SVG favicons
//   src/app/apple-icon.png 180      — iOS home screen
// Rasters can't follow prefers-color-scheme, so they put the light globe on
// the app's space-navy tile, which reads on light and dark tab strips alike.
// The art is on a 24-unit pixel grid; sizes are chosen so it lands on whole
// pixels (except 16, which can only be approximate).
//
// Usage: node scripts/build-favicons.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const APP = new URL("../src/app/", import.meta.url);
const svg = readFileSync(new URL("icon.svg", APP), "utf8");
const d = svg.match(/<path d="([^"]+)"/)[1];

const TILE = "#0c0f1a"; // BACKGROUND_STYLES "space"
const INK = "#fafafa"; // --primary-foreground

// scale = device px per art unit; the 24-unit art is centered on the tile.
const ICO = [
  { size: 16, scale: 0.5, radius: 3 },
  { size: 32, scale: 1, radius: 6 },
  { size: 64, scale: 2, radius: 12 },
];
const APPLE = { size: 180, scale: 6, radius: 0 }; // iOS applies its own mask

const browser = await chromium.launch();
const page = await browser.newPage();
const render = (spec) =>
  page.evaluate(
    ({ d, spec, TILE, INK }) => {
      const { size, scale, radius } = spec;
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const ctx = c.getContext("2d");
      ctx.fillStyle = TILE;
      ctx.beginPath();
      ctx.roundRect(0, 0, size, size, radius);
      ctx.fill();
      const off = (size - 24 * scale) / 2;
      ctx.setTransform(scale, 0, 0, scale, off, off);
      ctx.fillStyle = INK;
      ctx.fill(new Path2D(d));
      return c.toDataURL("image/png").split(",")[1];
    },
    { d, spec, TILE, INK },
  ).then((b64) => Buffer.from(b64, "base64"));

const pngs = [];
for (const spec of ICO) pngs.push(await render(spec));
const apple = await render(APPLE);
await browser.close();

// ICO container with embedded PNGs: 6-byte header, 16-byte entry per image.
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(pngs.length, 4);
let offset = 6 + 16 * pngs.length;
const entries = pngs.map((png, i) => {
  const e = Buffer.alloc(16);
  const s = ICO[i].size;
  e.writeUInt8(s >= 256 ? 0 : s, 0);
  e.writeUInt8(s >= 256 ? 0 : s, 1);
  e.writeUInt16LE(1, 4); // color planes
  e.writeUInt16LE(32, 6); // bits per pixel
  e.writeUInt32LE(png.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += png.length;
  return e;
});
writeFileSync(new URL("favicon.ico", APP), Buffer.concat([header, ...entries, ...pngs]));
writeFileSync(new URL("apple-icon.png", APP), apple);
console.log("✓ src/app/favicon.ico (16, 32, 64) + src/app/apple-icon.png (180)");
