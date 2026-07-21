// Build the browser-served mask artifacts from the repo-tracked detailed mask
// (data/land-mask.json) — no shapefile re-download needed.
//
//   public/data/land-mask-detail-v2.bin  ALL polygons, full source resolution,
//                                        binary delta-varint (~1/7 the JSON
//                                        size; see src/lib/maskcodec.mjs).
//                                        City/metro-scale clips.
//   public/data/land-mask-coarse-v2.json same 0.02°/0.06° coarse params as
//                                        scripts/build-landmask-osm.mjs, plus
//                                        5-decimal rounding (1.1 m — noise next
//                                        to its own 2.2 km tolerance). Country-
//                                        scale clips.
//
// Filenames are versioned: content changes MUST ship at a new URL because
// /data/* is served immutable (next.config.ts). Bump -v2 → -v3 (and the
// constants in src/lib/landmask.ts) when regenerating with different params.
//
// Usage: node scripts/build-client-masks.mjs
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { simplify } from "@turf/turf";
import { encodeMask, decodeIndex, hydratePolygon } from "../src/lib/maskcodec.mjs";

const detail = JSON.parse(readFileSync("data/land-mask.json", "utf8"));
let verts = 0;
for (const m of detail) for (const ring of m.c) verts += ring.length;
console.log(`source: ${detail.length} polys, ${verts} vertices`);

// --- detailed tier: binary, nothing dropped -------------------------------
const bin = encodeMask(detail);
writeFileSync("public/data/land-mask-detail-v2.bin", Buffer.from(bin));
console.log(
  `wrote public/data/land-mask-detail-v2.bin: ${(bin.byteLength / 1e6).toFixed(1)} MB`,
);

// round-trip spot check: decode a few polygons, max coord error must be ≤ half
// a quantization step.
{
  const index = decodeIndex(bin);
  let maxErr = 0;
  for (const i of [0, 1000, detail.length - 1]) {
    const rings = hydratePolygon(bin, index[i]);
    detail[i].c.forEach((ring, r) =>
      ring.forEach(([x, y], v) => {
        maxErr = Math.max(
          maxErr,
          Math.abs(x - rings[r][v][0]),
          Math.abs(y - rings[r][v][1]),
        );
      }),
    );
  }
  console.log(`round-trip max coord error: ${maxErr.toExponential(2)}°`);
  // bound is exactly half a quantization step; allow float-division noise
  if (maxErr > 5.001e-6) throw new Error("codec round-trip error above 1e-5/2");
}

// --- coarse tier: same params as build-landmask-osm.mjs + rounding --------
function ringBbox(rings) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const [x, y] of rings[0]) {
    if (x < a) a = x;
    if (y < b) b = y;
    if (x > c) c = x;
    if (y > d) d = y;
  }
  return [a, b, c, d];
}
const r5 = (v) => Math.round(v * 1e5) / 1e5;

const coarse = [];
let dropped = 0;
for (const m of detail) {
  const diag = Math.hypot(m.b[2] - m.b[0], m.b[3] - m.b[1]);
  if (diag < 0.06) {
    dropped++;
    continue;
  }
  let c = m.c;
  try {
    const s = simplify(
      { type: "Feature", geometry: { type: "Polygon", coordinates: m.c }, properties: {} },
      { tolerance: 0.02, highQuality: false, mutate: false },
    );
    c = s.geometry.coordinates;
  } catch {
    /* keep detailed */
  }
  if (!c?.[0] || c[0].length < 4) continue;
  const rounded = c.map((ring) => ring.map(([x, y]) => [r5(x), r5(y)]));
  coarse.push({ b: ringBbox(rounded).map(r5), c: rounded });
}
writeFileSync("public/data/land-mask-coarse-v2.json", JSON.stringify(coarse));
console.log(
  `wrote public/data/land-mask-coarse-v2.json: ${coarse.length} polys (dropped ${dropped} islets), ${(statSync("public/data/land-mask-coarse-v2.json").size / 1e6).toFixed(2)} MB`,
);
