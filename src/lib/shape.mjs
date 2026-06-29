// The render pipeline that turns a raw/clipped boundary into the legible outline
// the app draws: drop fringe pieces, then size-adaptive simplify. Shared (plain
// ESM, allowJs) so geo.ts (the app), the build scripts, and the QA harness all
// produce the SAME shape — no more "the render showed detail the app discards".
import { area, bbox, centroid, simplify } from "@turf/turf";

export function toMultiPolygonCoords(geom) {
  return geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
}

const polyFeature = (coordinates) => ({
  type: "Feature",
  geometry: { type: "Polygon", coordinates },
  properties: {},
});

/**
 * Drop sub-polygons that don't belong in a place's mental footprint:
 * far-flung exclaves (SF's Farallones, overseas territories) that blow up the
 * bbox + scaling, and microscopic clip-noise specks. NEARBY islands are KEPT —
 * Manhattan's Roosevelt/Governors/Liberty islands are part of the place.
 */
export function dropFringePolygons(geom) {
  if (geom.type !== "MultiPolygon" || geom.coordinates.length <= 1) return geom;
  const polys = geom.coordinates;
  const areas = polys.map((p) => area(polyFeature(p)));
  const mainIdx = areas.indexOf(Math.max(...areas));
  const mainC = centroid(polyFeature(polys[mainIdx])).geometry.coordinates;
  const mb = bbox(polyFeature(polys[mainIdx]));
  const mainRadiusDeg = Math.hypot(mb[2] - mb[0], mb[3] - mb[1]);

  const kept = polys.filter((p, i) => {
    if (i === mainIdx) return true;
    const c = centroid(polyFeature(p)).geometry.coordinates;
    const dist = Math.hypot(c[0] - mainC[0], c[1] - mainC[1]);
    if (dist > mainRadiusDeg * 2) return false; // far-flung exclave → drop
    return areas[i] >= areas[mainIdx] * 0.0005; // keep near islands, drop specks
  });
  return {
    type: "MultiPolygon",
    coordinates: kept.length ? kept : [polys[mainIdx]],
  };
}

/**
 * Clean for a legible outline: drop fringe, then simplify with a tolerance that
 * scales to the feature's own size (small islands keep detail, countries are
 * reduced). highQuality = full Douglas-Peucker, avoids angular artifacts.
 * Returns geometry (smoothing is applied separately so area can be measured here).
 */
export function cleanShape(geometry) {
  const geom = dropFringePolygons(geometry);
  const feat = { type: "Feature", geometry: geom, properties: {} };
  const b = bbox(feat);
  const diagDeg = Math.hypot(b[2] - b[0], b[3] - b[1]);
  const count = toMultiPolygonCoords(geom).reduce(
    (n, poly) => n + poly.reduce((m, ring) => m + ring.length, 0),
    0,
  );
  if (count < 60) return geom;
  // ~0.2% of the diagonal, floored low so small coastal features keep their
  // pier/inlet detail instead of melting into a blob.
  const tolerance = Math.min(0.05, Math.max(0.00018, diagDeg * 0.002));
  try {
    return simplify(feat, { tolerance, highQuality: true, mutate: false }).geometry;
  } catch {
    return geom;
  }
}
