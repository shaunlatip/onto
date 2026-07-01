// QA harness: fetch a varied test set from Nominatim, clip each to land, and
// emit /tmp/qa.geojson with before/after features (tagged) for visual review.
import { writeFileSync } from "node:fs";
import { area } from "@turf/turf";
import { clipToLand } from "../src/lib/landclip.mjs";
import { smoothGeometry } from "../src/lib/smooth.mjs";
import { cleanShape } from "../src/lib/shape.mjs";

// EXACT app pipeline (geo.ts buildPlace): dropFringe + simplify (cleanShape),
// then smoothing — so the QA render matches what the app actually draws.
function finalize(geometry) {
  if (!geometry) return null;
  return smoothGeometry(cleanShape(geometry));
}

const UA = "Onto/0.1 (https://github.com/shaunlatip/onto)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchBoundary(q) {
  const url =
    "https://nominatim.openstreetmap.org/search?format=jsonv2&polygon_geojson=1" +
    `&polygon_threshold=0.0006&limit=1&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "en" },
  });
  return (await res.json())[0]?.geojson ?? null;
}

const km2 = (g) => (g ? area({ type: "Feature", geometry: g, properties: {} }) / 1e6 : 0);

const QUERIES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      "San Francisco, California",
      "San Mateo County, California",
      "Dallas, Texas",
      "Manhattan, New York",
      "Boston, Massachusetts",
      "Singapore",
      "Hong Kong",
      "Canada",
    ];

const out = { type: "FeatureCollection", features: [] };
let i = 0;
for (const q of QUERIES) {
  const raw = await fetchBoundary(q);
  await sleep(1200);
  if (!raw) {
    console.log(`MISSING: ${q}`);
    continue;
  }
  const t0 = performance.now();
  const clipped = clipToLand(raw);
  const ms = (performance.now() - t0).toFixed(0);
  console.log(
    `${q}: ${km2(raw).toFixed(0)} -> ${km2(clipped).toFixed(0)} km²  (${ms}ms)`,
  );
  const final = finalize(clipped);
  out.features.push({ type: "Feature", properties: { label: q, stage: "before", order: i }, geometry: raw });
  if (final)
    out.features.push({ type: "Feature", properties: { label: q, stage: "after", order: i }, geometry: final });
  i++;
}
writeFileSync("/tmp/qa.geojson", JSON.stringify(out));
console.log("wrote /tmp/qa.geojson");
