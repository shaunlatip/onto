// Build the land masks from OSM coastline (osmdata.openstreetmap.de
// simplified-land-polygons, EPSG:3857) — far crisper coastlines than Natural
// Earth 10m, and aligned with the OSM admin boundaries we clip. ODbL.
//
// Input:  /tmp/simplified-3857/.../simplified_land_polygons.shp
//         (download + unzip: scripts/download.mjs then unzip)
// Output: data/land-mask.json        detailed, for city/metro-scale clips
//         data/land-mask-coarse.json simplified + islets dropped, for countries
//
// Same [{ b:[minX,minY,maxX,maxY], c: Polygon-rings }] format clipToLand reads,
// so this is a drop-in data swap. Polygons stay whole (no split seams).
import { writeFileSync, mkdirSync, statSync } from "node:fs";
import * as shapefile from "shapefile";
import { simplify } from "@turf/turf";

const SHP =
  "/tmp/simplified-3857/simplified-land-polygons-complete-3857/simplified_land_polygons.shp";

const R = 6378137;
const toLon = (x) => (x / R) * (180 / Math.PI);
const toLat = (y) => (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI);

function reproRings(poly) {
  return poly.map((ring) => ring.map(([x, y]) => [toLon(x), toLat(y)]));
}
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

const detail = [];
const source = await shapefile.open(SHP);
let feats = 0;
while (true) {
  const r = await source.read();
  if (r.done) break;
  feats++;
  const g = r.value?.geometry;
  if (!g) continue;
  const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
  for (const poly of polys) {
    const rings = reproRings(poly);
    if (!rings[0] || rings[0].length < 4) continue;
    detail.push({ b: ringBbox(rings), c: rings });
  }
}
console.log("shapefile features:", feats, "→ polygons:", detail.length);

mkdirSync("data", { recursive: true });
writeFileSync("data/land-mask.json", JSON.stringify(detail));
console.log(
  "wrote data/land-mask.json:",
  detail.length,
  "polys,",
  (statSync("data/land-mask.json").size / 1e6).toFixed(1),
  "MB",
);

// Coarse: simplify hard and drop islets too small to matter at country scale.
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
      { tolerance: 0.02, highQuality: false, mutate: true },
    );
    c = s.geometry.coordinates;
  } catch {
    /* keep detailed */
  }
  if (!c?.[0] || c[0].length < 4) continue;
  coarse.push({ b: ringBbox(c), c });
}
writeFileSync("data/land-mask-coarse.json", JSON.stringify(coarse));
console.log(
  "wrote data/land-mask-coarse.json:",
  coarse.length,
  "polys (dropped",
  dropped,
  "islets),",
  (statSync("data/land-mask-coarse.json").size / 1e6).toFixed(2),
  "MB",
);
