// Node wrapper around the pure clip core: loads the land mask off disk and
// delegates the geometry work to landclip-core.mjs. Used by the build scripts
// (build-metros, build-regions, test-clip, …). The browser selection path does
// NOT go through here — it fetches the coarse mask over HTTP and calls the core
// directly (see landmask.ts), so no Node built-ins reach the client bundle.
//
// Mask: data/land-mask.json / data/land-mask-coarse.json =
//   [{ b:[minx,miny,maxx,maxy], c: Polygon rings }] (NE land, exploded).
import { readFileSync } from "node:fs";
import path from "node:path";
import { bbox } from "@turf/turf";
import { clipToLandWithMask } from "./landclip-core.mjs";

const MASKS = { detail: null, coarse: null };

function loadMask(coarse) {
  const key = coarse ? "coarse" : "detail";
  if (MASKS[key]) return MASKS[key];
  const file = path.join(
    process.cwd(),
    "data",
    coarse ? "land-mask-coarse.json" : "land-mask.json",
  );
  MASKS[key] = JSON.parse(readFileSync(file, "utf8"));
  return MASKS[key];
}

/**
 * Clip a Polygon/MultiPolygon to land. Returns a MultiPolygon (ocean removed,
 * inland water kept) or null if the feature is entirely over water. Non-area
 * input is returned untouched. Picks the coarse mask for large features unless
 * `coarse` is forced.
 */
export function clipToLand(geometry, { coarse: useCoarse } = {}) {
  if (!geometry) return null;
  if (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")
    return geometry;

  const fb = bbox({ type: "Feature", geometry, properties: {} });
  const diag = Math.hypot(fb[2] - fb[0], fb[3] - fb[1]);
  const coarse = useCoarse ?? diag >= 3.5;
  const mask = loadMask(coarse);
  return clipToLandWithMask(geometry, mask, { coarse });
}
