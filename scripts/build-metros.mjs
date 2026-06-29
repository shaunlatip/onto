// Build the bundled metros dataset from the GHS-FUA ingest.
// Input:  /tmp/metros_raw.geojson  (produced by /tmp/ingest_fua.py)
// Output: public/data/metros.geojson  (lightly simplified + precision-trimmed)
//
// GHS-FUA (JRC, R2019A) Functional Urban Areas, pop >= 1M. CC-BY-equivalent.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { simplify } from "@turf/turf";
import { clipToLand } from "../src/lib/landclip.mjs";

const raw = JSON.parse(readFileSync("/tmp/metros_raw.geojson", "utf8"));

// 5 decimals (~1 m), not 3 (~111 m) — the old grid snap was a direct cause of
// the staircase borders. Client-side smoothing finishes the job.
const round = (n) => Math.round(n * 1e5) / 1e5;
function trim(geom) {
  geom.coordinates = geom.coordinates.map((poly) =>
    poly.map((ring) => ring.map(([x, y]) => [round(x), round(y)])),
  );
  return geom;
}

// raw is sorted by population desc; keep the largest per name+country.
const seen = new Set();
const out = [];
for (const f of raw.features) {
  const key = `${f.properties.name}|${f.properties.iso}`;
  if (seen.has(key)) continue;
  seen.add(key);
  let feat = f;
  try {
    feat = simplify(f, { tolerance: 0.004, highQuality: false, mutate: false });
  } catch {
    feat = f;
  }
  let geom = feat.geometry;
  // Clip the metro footprint to land so coastal FUAs (Tokyo, NYC, Jakarta)
  // shed their bay/harbor water. Keep the original if the clip leaves nothing.
  try {
    const clipped = clipToLand(geom);
    if (clipped) geom = clipped;
  } catch {
    /* keep unclipped */
  }
  trim(geom);
  out.push({
    type: "Feature",
    properties: f.properties,
    geometry: geom,
  });
}

mkdirSync("public/data", { recursive: true });
const fc = { type: "FeatureCollection", features: out };
writeFileSync("public/data/metros.geojson", JSON.stringify(fc));
console.log("metros:", out.length);
