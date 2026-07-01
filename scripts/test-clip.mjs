// Validate clipToLand on real OSM boundaries: timing, area before/after,
// piece counts. Writes clipped shapes to /tmp for visual inspection.
import { writeFileSync } from "node:fs";
import { area, bbox } from "@turf/turf";
import { clipToLand } from "../src/lib/landclip.mjs";

const UA = "Onto/0.1 (https://github.com/shaunlatip/onto)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchBoundary(q) {
  const url =
    "https://nominatim.openstreetmap.org/search?format=jsonv2&polygon_geojson=1" +
    `&polygon_threshold=0.0006&limit=1&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "en" },
  });
  const data = await res.json();
  return data[0]?.geojson ?? null;
}

const km2 = (g) => g && area({ type: "Feature", geometry: g, properties: {} }) / 1e6;
const count = (g) => {
  if (!g) return 0;
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  return polys.reduce((n, poly) => n + poly.reduce((m, r) => m + r.length, 0), 0);
};
const parts = (g) =>
  !g ? 0 : g.type === "Polygon" ? 1 : g.coordinates.length;

const QUERIES = [
  "San Francisco, California",
  "Dallas, Texas",
  "Canada",
];

const debug = { type: "FeatureCollection", features: [] };

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
    `\n${q}\n  before: ${km2(raw)?.toFixed(0)} km², ${count(raw)} pts, ${parts(raw)} parts, bbox ${bbox({ type: "Feature", geometry: raw, properties: {} }).map((n) => n.toFixed(1))}` +
      `\n  after:  ${km2(clipped)?.toFixed(0)} km², ${count(clipped)} pts, ${parts(clipped)} parts` +
      `\n  clip time: ${ms} ms`,
  );
  if (clipped)
    debug.features.push({
      type: "Feature",
      properties: { name: q },
      geometry: clipped,
    });
}

writeFileSync("/tmp/clip-debug.geojson", JSON.stringify(debug));
console.log("\nwrote /tmp/clip-debug.geojson");
