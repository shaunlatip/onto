import type { MultiPolygon, Polygon } from "geojson";
import { clipToLandWithMask } from "./landclip-core.mjs";

/** Coarse land mask: [{ b:[minx,miny,maxx,maxy], c: Polygon rings }]. Served as
 *  a static asset from public/data so it's CDN-cached, not bundled into the
 *  serverless function. */
type LandMask = { b: [number, number, number, number]; c: Polygon["coordinates"] }[];

type Area = Polygon | MultiPolygon;

let maskPromise: Promise<LandMask | null> | null = null;

/**
 * Kick off (once) the background download of the coarse land mask so it's warm
 * in the browser cache before the user selects a place. Called on search-field
 * focus; idempotent. A failed fetch resets so a later selection can retry
 * rather than pinning the failure for the session.
 */
export function prefetchLandMask(): Promise<LandMask | null> {
  if (!maskPromise) {
    maskPromise = fetch("/data/land-mask-coarse.json")
      .then((r) => (r.ok ? (r.json() as Promise<LandMask>) : null))
      .catch(() => {
        maskPromise = null;
        return null;
      });
  }
  return maskPromise;
}

/**
 * Clip a selected OSM boundary to land, entirely in the browser — no server
 * round-trip, so selection is instant once the mask is warm. Uses the coarse
 * mask (sufficient for the map's selected-place zoom). Returns the raw shape if
 * the mask is unavailable, so a selection never fails on this.
 */
export async function clipSelectedGeometry(geometry: Area): Promise<Area> {
  try {
    const mask = await prefetchLandMask();
    if (!mask) return geometry;
    return (
      (clipToLandWithMask(geometry, mask, { coarse: true }) as Area | null) ??
      geometry
    );
  } catch {
    return geometry;
  }
}
