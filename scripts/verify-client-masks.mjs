// Verify the browser mask pipeline against the old server one: clip real OSM
// boundaries through (a) the Node path on data/land-mask.json (what the server
// used pre-client-clip — the quality baseline) and (b) the exact browser path
// on public/data/land-mask-detail-v2.bin (decodeIndex → bbox filter → hydrate
// → clipToLandWithMask). The binary is quantized at 1e-5°, so area deltas
// should be ~0.01%; anything ≥ 0.1% fails the run.
//
// Usage: node scripts/verify-client-masks.mjs  (network: fetches Nominatim)
import { readFileSync } from "node:fs";
import { area } from "@turf/turf";
import { clipToLand } from "../src/lib/landclip.mjs";
import { clipToLandWithMask } from "../src/lib/landclip-core.mjs";
import { decodeIndex, hydratePolygon } from "../src/lib/maskcodec.mjs";

const PLACES = [
  "San Francisco, California",
  "Manhattan, New York",
  "Hong Kong",
  "Boston, Massachusetts",
  "Singapore",
];

const bin = readFileSync("public/data/land-mask-detail-v2.bin");
const buffer = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
const index = decodeIndex(buffer);

const overlaps = (a, b) =>
  a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

function featureBbox(geometry) {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  const polys = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  for (const poly of polys)
    for (const [x, y] of poly[0]) {
      if (x < minx) minx = x;
      if (y < miny) miny = y;
      if (x > maxx) maxx = x;
      if (y > maxy) maxy = y;
    }
  return [minx, miny, maxx, maxy];
}

function clipBrowserPath(geometry) {
  const fb = featureBbox(geometry);
  const candidates = [];
  for (const entry of index) {
    if (!overlaps(fb, entry.b)) continue;
    candidates.push({ b: entry.b, c: hydratePolygon(buffer, entry) });
  }
  return { clipped: clipToLandWithMask(geometry, candidates, { coarse: false }), candidates: candidates.length };
}

const km2 = (g) =>
  g ? area({ type: "Feature", geometry: g, properties: {} }) / 1e6 : 0;
const verts = (g) => {
  if (!g) return 0;
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  let n = 0;
  for (const poly of polys) for (const ring of poly) n += ring.length;
  return n;
};

let failed = false;
for (const q of PLACES) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("polygon_geojson", "1");
  url.searchParams.set("polygon_threshold", "0.0006");
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", q);
  const res = await fetch(url, { headers: { "User-Agent": "Onto/0.1 (https://github.com/shaunlatip/onto)" } });
  const item = (await res.json())[0];
  const raw = item?.geojson;
  if (!raw || (raw.type !== "Polygon" && raw.type !== "MultiPolygon")) {
    console.log(`${q}: no boundary, skipped`);
    continue;
  }

  let t = performance.now();
  const oldClip = clipToLand(raw);
  const oldMs = performance.now() - t;
  t = performance.now();
  const { clipped: newClip, candidates } = clipBrowserPath(raw);
  const newMs = performance.now() - t;

  const a0 = km2(oldClip);
  const a1 = km2(newClip);
  const deltaPct = a0 ? (Math.abs(a1 - a0) / a0) * 100 : a1 ? 100 : 0;
  const ok = deltaPct < 0.1;
  if (!ok) failed = true;
  console.log(
    `${ok ? "✓" : "✗"} ${q}: old ${a0.toFixed(1)} km² (${verts(oldClip)} verts, ${oldMs.toFixed(0)}ms) | ` +
      `new ${a1.toFixed(1)} km² (${verts(newClip)} verts, ${newMs.toFixed(0)}ms, ${candidates} cands) | Δ ${deltaPct.toFixed(4)}%`,
  );
  await new Promise((r) => setTimeout(r, 1200)); // Nominatim ≤1 req/s
}
process.exit(failed ? 1 : 0);
