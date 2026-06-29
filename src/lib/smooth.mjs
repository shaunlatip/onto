// Chaikin corner-cutting to round the staircase out of admin boundaries — the
// blockiness shows even on inland cities (Dallas) where there's no water to
// clip, so this runs on every rendered shape. Plain ESM (allowJs) so the
// client (geo.ts), build scripts, and QA harness all smooth identically.

/** One Chaikin pass over a closed ring, treating it as a true loop so the
 *  start/end seam rounds like any other corner. Each pass ~doubles points. */
function chaikinRing(ring, iterations) {
  // strip the duplicated closing vertex; we re-close at the end
  let pts = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
    ? ring.slice(0, -1)
    : ring.slice();
  for (let it = 0; it < iterations; it++) {
    if (pts.length < 4) break; // too few to round without going degenerate
    const next = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    pts = next;
  }
  pts.push([pts[0][0], pts[0][1]]);
  return pts;
}

const smoothPolygon = (poly, iterations) =>
  poly.map((ring) => chaikinRing(ring, iterations));

/**
 * Round the corners of a Polygon/MultiPolygon. Rings with very few points
 * (already smooth circles from the curated fallback) are left as-is.
 *
 * Default is ONE pass: the simplify step upstream already kills the staircase,
 * so a single Chaikin pass de-blocks inland boundaries (Dallas) without rounding
 * real coastline corners into a blob. Two passes measurably over-smooths coasts.
 */
export function smoothGeometry(geometry, iterations = 1) {
  if (!geometry || iterations < 1) return geometry;
  if (geometry.type === "Polygon") {
    return { type: "Polygon", coordinates: smoothPolygon(geometry.coordinates, iterations) };
  }
  if (geometry.type === "MultiPolygon") {
    return {
      type: "MultiPolygon",
      coordinates: geometry.coordinates.map((poly) => smoothPolygon(poly, iterations)),
    };
  }
  return geometry;
}
