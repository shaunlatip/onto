// Pure land-clipping — no filesystem, no Node built-ins. Given a boundary and a
// pre-loaded land mask, clip to land (ocean and bays removed, inland water
// kept). Imports only turf, so it runs in the browser on the selection path as
// well as in the Node build scripts (via landclip.mjs, which loads the mask off
// disk and delegates here).
//
// Mask shape: [{ b:[minx,miny,maxx,maxy], c: Polygon rings }] — the Natural
// Earth land layer exploded to single polygons, each with a precomputed bbox.
import { bbox, bboxClip, intersect, featureCollection, simplify } from "@turf/turf";

const overlaps = (a, b) =>
  a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

const polyFeature = (coordinates) => ({
  type: "Feature",
  geometry: { type: "Polygon", coordinates },
  properties: {},
});

function pushPolys(geom, out) {
  if (!geom) return;
  if (geom.type === "Polygon") out.push(geom.coordinates);
  else if (geom.type === "MultiPolygon") for (const p of geom.coordinates) out.push(p);
}

/**
 * Clip a Polygon/MultiPolygon to land against a pre-loaded `mask`. Returns a
 * MultiPolygon (ocean removed, inland water kept) or null if the feature is
 * entirely over water. Non-area input is returned untouched.
 *
 * `coarse` selects the algorithm (matching the mask you pass): coarse simplifies
 * the input and drops tiny islets; detailed keeps full coastline. When omitted
 * it's inferred from the feature's size, matching the Node default.
 */
export function clipToLandWithMask(geometry, mask, { coarse: useCoarse } = {}) {
  if (!geometry) return null;
  if (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")
    return geometry;

  let feat = { type: "Feature", geometry, properties: {} };
  const fb = bbox(feat);
  const pieces = [];

  // Coastline detail beyond the feature's own scale is both invisible and
  // ruinously expensive (Canada vs. thousands of detailed Arctic islands).
  // City-scale features keep full coastline detail; country-scale features use
  // a pre-simplified coarse mask (tiny islets dropped) AND a simplified input,
  // so the clip stays fast at the price of detail nobody can see at that zoom.
  const diag = Math.hypot(fb[2] - fb[0], fb[3] - fb[1]);
  const coarse = useCoarse ?? diag >= 3.5;
  const tol = diag * 0.0015;
  const simplifyLand = !coarse && tol >= 0.002;
  // For big features, skip land polygons too small to matter — drops the long
  // tail of islets that otherwise dominates the candidate count.
  const minCandDiag = coarse ? diag * 0.004 : 0;

  if (coarse) {
    try {
      feat = simplify(feat, { tolerance: Math.min(tol, 0.1), highQuality: false, mutate: false });
    } catch {
      /* keep full detail */
    }
  }

  for (const m of mask) {
    if (!overlaps(fb, m.b)) continue;
    if (minCandDiag && Math.hypot(m.b[2] - m.b[0], m.b[3] - m.b[1]) < minCandDiag)
      continue;

    // The coarse mask is already small per polygon; only the detailed path
    // needs the bbox pre-trim (a continent polygon carries thousands of
    // coastline points, and every city would otherwise intersect the whole
    // thing). feature ⊆ its own bbox, so feature ∩ (land ∩ bbox) == feature ∩
    // land — the bbox cut never reaches the feature, so no seams appear.
    let local = polyFeature(m.c);
    if (!coarse) {
      try {
        local = bboxClip(local, fb);
      } catch {
        local = polyFeature(m.c);
      }
    }
    let lg = local?.geometry;
    if (!lg?.coordinates?.length) continue;
    if (lg.type === "Polygon" && !lg.coordinates[0]?.length) continue;
    if (simplifyLand) {
      try {
        local = simplify(local, { tolerance: Math.min(tol, 0.1), highQuality: false, mutate: true });
        lg = local.geometry;
        if (!lg?.coordinates?.length) continue;
        if (lg.type === "Polygon" && !lg.coordinates[0]?.length) continue;
      } catch {
        /* keep unsimplified */
      }
    }

    let clipped;
    try {
      clipped = intersect(featureCollection([feat, local]));
    } catch {
      clipped = null;
    }
    pushPolys(clipped?.geometry, pieces);
  }

  if (!pieces.length) return null;
  return { type: "MultiPolygon", coordinates: pieces };
}
