/** Warm the browser HTTP cache for the basemap tiles a camera move is about to
 *  need, so the map textures are already downloaded by the time the fly lands.
 *
 *  MapLibre only requests a tile once the animating camera is close enough to
 *  see it, so the destination's high-zoom tiles start downloading near the *end*
 *  of the fly and pop in a beat late. Here we look at where the camera is headed
 *  (without moving it) and pre-fetch those tiles up front, racing them against
 *  the animation instead of trailing it.
 *
 *  The trick is generating the *exact* URLs MapLibre will request — subdomain
 *  included — so the warmed responses are true cache hits, not near-misses.
 *  MapLibre's CanonicalTileID.url picks the subdomain via `(x + y) % tiles.length`
 *  (see maplibre-gl source); we mirror that below. */

import type { MapRef } from "react-map-gl/maplibre";
import type { Bounds } from "@/lib/geo";

type MapLike = ReturnType<MapRef["getMap"]>;

const lon2tile = (lon: number, z: number) =>
  Math.floor(((lon + 180) / 360) * 2 ** z);

const lat2tile = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z,
  );
};

const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));

/** URLs we've already warmed this session — never fetch a tile twice. */
const warmed = new Set<string>();

/** Pre-fetch the vector/raster tiles the upcoming `fitBounds` will settle on
 *  (its landing zoom plus the two parent levels the tail of the fly draws). */
export function prefetchTilesForBounds(
  map: MapLike,
  bounds: Bounds,
  padding: number,
  fitMaxZoom: number,
) {
  // Resolve the zoom the camera will land on — without touching the camera.
  let landingZoom: number;
  try {
    const cam = map.cameraForBounds(
      [
        [bounds[0], bounds[1]],
        [bounds[2], bounds[3]],
      ],
      { padding, maxZoom: fitMaxZoom },
    );
    if (!cam || typeof cam.zoom !== "number") return;
    landingZoom = Math.round(cam.zoom);
  } catch {
    return;
  }

  const sources = map.getStyle()?.sources;
  if (!sources) return;

  for (const [id, spec] of Object.entries(sources)) {
    if (spec.type !== "vector" && spec.type !== "raster") continue;
    const src = map.getSource(id) as unknown as {
      tiles?: string[];
      minzoom?: number;
      maxzoom?: number;
      scheme?: "xyz" | "tms";
    } | null;
    const templates = src?.tiles;
    if (!templates?.length) continue;

    const srcMax = src?.maxzoom ?? 22;
    const srcMin = src?.minzoom ?? 0;

    for (let dz = 0; dz <= 2; dz++) {
      const z = Math.min(srcMax, Math.max(srcMin, landingZoom - dz));
      const n = 2 ** z;
      const xMin = clamp(lon2tile(bounds[0], z), n - 1);
      const xMax = clamp(lon2tile(bounds[2], z), n - 1);
      // North latitude maps to the smaller tile-y.
      const yMin = clamp(lat2tile(bounds[3], z), n - 1);
      const yMax = clamp(lat2tile(bounds[1], z), n - 1);

      for (let x = xMin; x <= xMax; x++) {
        for (let y = yMin; y <= yMax; y++) {
          const tmpl = templates[(x + y) % templates.length];
          const ty = src?.scheme === "tms" ? n - y - 1 : y;
          const url = tmpl
            .replace(/{z}/g, String(z))
            .replace(/{x}/g, String(x))
            .replace(/{y}/g, String(ty));
          if (warmed.has(url)) continue;
          warmed.add(url);
          // Fire-and-forget: we just want the response sitting in the HTTP
          // cache. Drop it from the set on failure so the real request retries.
          void fetch(url).catch(() => warmed.delete(url));
        }
      }
    }
  }
}
