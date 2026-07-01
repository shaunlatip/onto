// Build curated multi-unit regions Nominatim doesn't return as one polygon
// (Bay Area = 9 counties, New England = 6 states, EU = 27 states).
// Fetches each member boundary (1 req/s) and unions them. One-time build.
// Output: public/data/regions.geojson
import { writeFileSync, mkdirSync } from "node:fs";
import { union, simplify, featureCollection } from "@turf/turf";
import { clipToLand } from "../src/lib/landclip.mjs";

const UA = "Onto/0.1 (https://github.com/shaunlatip/onto)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchBoundary(q) {
  const url =
    "https://nominatim.openstreetmap.org/search?format=jsonv2&polygon_geojson=1" +
    `&polygon_threshold=0.008&limit=1&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "en" },
  });
  const data = await res.json();
  const g = data[0]?.geojson;
  if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) return null;
  return { type: "Feature", geometry: g, properties: {} };
}

const REGIONS = [
  {
    name: "San Francisco Bay Area",
    short: "Bay Area",
    country: "United States",
    members: [
      "Alameda County, California",
      "Contra Costa County, California",
      "Marin County, California",
      "Napa County, California",
      "San Francisco, California",
      "San Mateo County, California",
      "Santa Clara County, California",
      "Solano County, California",
      "Sonoma County, California",
    ],
  },
  {
    name: "New England",
    short: "New England",
    country: "United States",
    members: [
      "Maine, United States",
      "New Hampshire, United States",
      "Vermont, United States",
      "Massachusetts, United States",
      "Rhode Island, United States",
      "Connecticut, United States",
    ],
  },
  {
    name: "European Union",
    short: "European Union",
    country: "Europe",
    members: [
      "Austria","Belgium","Bulgaria","Croatia","Czechia","Denmark","Estonia",
      "Finland","Germany","Greece","Hungary","Ireland","Italy","Latvia",
      "Lithuania","Luxembourg","Malta","Netherlands","Poland","Portugal",
      "Romania","Slovakia","Slovenia","Spain","Sweden","Cyprus",
      "Metropolitan France",
    ],
  },
];

const features = [];
for (const region of REGIONS) {
  const parts = [];
  for (const m of region.members) {
    const f = await fetchBoundary(m);
    await sleep(1100);
    if (!f) {
      console.warn("  missing:", m);
      continue;
    }
    try {
      parts.push(simplify(f, { tolerance: 0.012, highQuality: false }));
    } catch {
      parts.push(f);
    }
  }
  if (!parts.length) continue;
  let merged;
  try {
    merged = parts.length === 1 ? parts[0] : union(featureCollection(parts));
  } catch (e) {
    console.warn("  union failed for", region.name, e.message);
    merged = parts[0];
  }
  // Clip the merged region to land — the Bay Area's nine counties wrap the bay,
  // New England's coast carries tidal water; both should read as land.
  try {
    const clipped = clipToLand(merged.geometry);
    if (clipped) merged = { type: "Feature", geometry: clipped, properties: {} };
  } catch {
    /* keep unclipped */
  }
  try {
    merged = simplify(merged, { tolerance: 0.01, highQuality: false });
  } catch {}
  features.push({
    type: "Feature",
    properties: {
      name: region.name,
      short: region.short,
      country: region.country,
    },
    geometry: merged.geometry,
  });
  console.log("built:", region.name, `(${parts.length} parts)`);
}

mkdirSync("public/data", { recursive: true });
writeFileSync(
  "public/data/regions.geojson",
  JSON.stringify({ type: "FeatureCollection", features }),
);
console.log("regions:", features.length);
