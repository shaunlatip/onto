// Experiment: separate "over-smoothing" from "mask resolution" as causes of
// blobby coastlines. For each place, emit three variants:
//   raw-clip   : clipToLand only (the NE 10m mask ceiling, no processing)
//   chaikin1   : clip -> simplify -> 1 smoothing pass
//   chaikin2   : clip -> simplify -> 2 smoothing passes (current shipping)
import { writeFileSync } from "node:fs";
import { bbox, simplify } from "@turf/turf";
import { clipToLand } from "../src/lib/landclip.mjs";
import { smoothGeometry } from "../src/lib/smooth.mjs";

const UA = "Span/0.1 (https://github.com/shaunlatip/span)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchBoundary(q) {
  const url =
    "https://nominatim.openstreetmap.org/search?format=jsonv2&polygon_geojson=1" +
    `&polygon_threshold=0.0006&limit=1&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en" } });
  return (await res.json())[0]?.geojson ?? null;
}
function finalize(geometry, iters) {
  if (!geometry) return null;
  const feat = { type: "Feature", geometry, properties: {} };
  const b = bbox(feat);
  const diag = Math.hypot(b[2] - b[0], b[3] - b[1]);
  const tol = Math.min(0.05, Math.max(0.0004, diag * 0.0035));
  let s = feat;
  try { s = simplify(feat, { tolerance: tol, highQuality: true, mutate: false }); } catch {}
  return iters < 1 ? geometry : smoothGeometry(s.geometry, iters);
}

const QUERIES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["San Francisco, California", "Manhattan, New York", "Hong Kong"];
const out = { type: "FeatureCollection", features: [] };
let i = 0;
for (const q of QUERIES) {
  const raw = await fetchBoundary(q);
  await sleep(1200);
  if (!raw) { console.log("MISSING", q); continue; }
  const clipped = clipToLand(raw);
  const variants = {
    "raw-clip": clipped,
    chaikin1: finalize(clipped, 1),
    chaikin2: finalize(clipped, 2),
  };
  for (const [variant, geom] of Object.entries(variants)) {
    if (geom) out.features.push({ type: "Feature", properties: { label: q.split(",")[0], variant, order: i }, geometry: geom });
  }
  console.log(q);
  i++;
}
writeFileSync("/tmp/exp.geojson", JSON.stringify(out));
console.log("wrote /tmp/exp.geojson");
