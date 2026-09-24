// Verifies that placeOverlay() keeps a place at its TRUE size and shape
// wherever it is dragged — across latitudes, near the poles, and across the
// antimeridian. It exercises the real src/lib/geo.ts, fed real Natural Earth
// country outlines.
//
// Why one check covers both views: the overlay is lon/lat GeoJSON, and MapLibre
// projects it the same way it projects the basemap under it — Mercator or
// globe. An overlay whose ground geometry is identical to the real place
// therefore reads correctly against the basemap in BOTH views. So we measure
// ground truth directly:
//   • area   — geodesic area of the placed outline ÷ area at home (want 1.000)
//   • shape  — great-circle distances between sampled vertex pairs, placed vs.
//              home, worst error as % of the shape's diameter (want ~0)
//   • north  — bearing from the centroid to the shape's farthest vertex, placed
//              vs. home (want ~0°: the shape shouldn't twist as it moves)
//   • edge   — no vertex past the map's ±85.05° edge, even for a target at ±89°
//              (MapLibre draws nothing beyond it, in either view)
//   • wrap   — no ring jumps >180° of longitude between neighboring vertices
//
// Usage:
//   node scripts/download.mjs \
//     https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson \
//     .context/ne_50m_countries.geojson
//   node --experimental-strip-types scripts/verify-true-size.mjs [countries.geojson]
import { readFileSync } from "node:fs";
import { area, bearing, distance } from "@turf/turf";
import { buildPlace, clampPlacement, placeOverlay } from "../src/lib/geo.ts";

const file = process.argv[2] ?? ".context/ne_50m_countries.geojson";
const countries = JSON.parse(readFileSync(file, "utf8")).features;

// High-latitude and huge shapes are the stress cases; the rest are controls.
const NAMES = [
  "Greenland",
  "United States of America",
  "Canada",
  "Russia",
  "Norway",
  "Iceland",
  "Brazil",
  "Australia",
  "Chile",
  "Indonesia",
  "New Zealand",
  "Fiji", // straddles the antimeridian
  "Singapore",
  "Antarctica", // already past the map edge at home
];
// ±89 asks for more than the map can show → exercises the clamp.
const TARGET_LATS = [-89, -75, -60, -40, -20, 0, 20, 40, 60, 75, 89];
const TARGET_LONS = [-40, 178]; // 178 → the outline must cross ±180

const AREA_TOL = 0.005; // 0.5%
const SHAPE_TOL = 0.01; // 1% of the diameter
const NORTH_TOL = 1; // degrees
const MAP_EDGE = 85.05 + 1e-6;

function vertices(geom) {
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  return polys.flatMap((p) => p.flatMap((ring) => ring.slice(0, -1)));
}

/** Evenly spaced sample of vertex indices, so pairwise checks stay cheap. */
function sampleIdx(n, k = 48) {
  if (n <= k) return [...Array(n).keys()];
  return Array.from({ length: k }, (_, i) => Math.floor((i * n) / k));
}

function measure(place, placed, center) {
  const home = vertices(place.feature.geometry);
  const moved = vertices(placed.geometry);
  if (home.length !== moved.length) throw new Error("vertex count changed");

  const areaRatio = area(placed) / area(place.feature);

  const idx = sampleIdx(home.length);
  let diameter = 0;
  let worst = 0;
  for (let a = 0; a < idx.length; a++) {
    for (let b = a + 1; b < idx.length; b++) {
      const d0 = distance(home[idx[a]], home[idx[b]]);
      const d1 = distance(moved[idx[a]], moved[idx[b]]);
      diameter = Math.max(diameter, d0);
      worst = Math.max(worst, Math.abs(d1 - d0));
    }
  }
  const shapeErr = diameter ? worst / diameter : 0;

  // Twist: bearing from the centroid to the vertex farthest from it.
  const c0 = place.center;
  const c1 = center;
  let far = 0;
  let farD = -1;
  for (let i = 0; i < home.length; i++) {
    const d = distance(c0, home[i]);
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  const twist = Math.abs(
    ((bearing(c1, moved[far]) - bearing(c0, home[far]) + 540) % 360) - 180,
  );

  // Only a place already past the edge at home, sitting at its home latitude,
  // may reach past it.
  const maxAbsLat = (vs) => Math.max(...vs.map((v) => Math.abs(v[1])));
  const atHomeLat = Math.abs(center[1] - place.center[1]) < 1e-9;
  const edgeOk =
    maxAbsLat(moved) <=
    (atHomeLat ? Math.max(MAP_EDGE, maxAbsLat(home) + 1e-6) : MAP_EDGE);

  const polys =
    placed.geometry.type === "Polygon"
      ? [placed.geometry.coordinates]
      : placed.geometry.coordinates;
  const wrapOk = polys.every((p) =>
    p.every((ring) =>
      ring.every((v, i) => i === 0 || Math.abs(v[0] - ring[i - 1][0]) <= 180),
    ),
  );

  return { areaRatio, shapeErr, twist, edgeOk, wrapOk };
}

let failures = 0;
let checks = 0;
for (const name of NAMES) {
  const raw = countries.find((f) => f.properties.NAME === name);
  if (!raw) {
    console.log(`?? ${name} not found`);
    continue;
  }
  const place = buildPlace(raw, { id: name, label: name, shortLabel: name });
  const rows = [];
  for (const lon of TARGET_LONS) {
    for (const lat of TARGET_LATS) {
      const placed = placeOverlay(place, [lon, lat]);
      const landed = clampPlacement(place, [lon, lat]);
      const m = measure(place, placed, landed);
      const ok =
        Math.abs(m.areaRatio - 1) <= AREA_TOL &&
        m.shapeErr <= SHAPE_TOL &&
        m.twist <= NORTH_TOL &&
        m.edgeOk &&
        m.wrapOk;
      checks++;
      if (!ok) failures++;
      rows.push({ lon, lat, landed: landed[1], ...m, ok });
    }
  }
  const worstArea = rows.reduce((w, r) =>
    Math.abs(r.areaRatio - 1) > Math.abs(w.areaRatio - 1) ? r : w,
  );
  const worstShape = rows.reduce((w, r) => (r.shapeErr > w.shapeErr ? r : w));
  const bad = rows.filter((r) => !r.ok).length;
  const [south, north] = place.latRange;
  console.log(
    `${bad ? `FAIL ${bad}/${rows.length}` : `ok ${rows.length}/${rows.length}`}`.padEnd(11) +
      `${name.padEnd(25)}` +
      `area ×${worstArea.areaRatio.toFixed(4)}  ` +
      `shape ${(worstShape.shapeErr * 100).toFixed(2)}%  ` +
      `twist ${Math.max(...rows.map((r) => r.twist)).toFixed(2)}°  ` +
      `centroid lat ${place.center[1].toFixed(1)}° may go ${south.toFixed(1)}°…${north.toFixed(1)}°`,
  );
  if (process.env.VERBOSE || bad) {
    for (const r of rows)
      console.log(
        `     ${String(r.lon).padStart(4)},${String(r.lat).padStart(4)} → lat ${r.landed.toFixed(1).padStart(5)}  area ×${r.areaRatio.toFixed(4)}  shape ${(r.shapeErr * 100).toFixed(2)}%  twist ${r.twist.toFixed(2)}°` +
          `${r.edgeOk ? "" : "  past map edge"}${r.wrapOk ? "" : "  ring jumps ±180"}${r.ok ? "" : "  ✗"}`,
      );
  }
}

console.log(`\n${checks - failures}/${checks} placements within tolerance`);
process.exit(failures ? 1 : 0);
