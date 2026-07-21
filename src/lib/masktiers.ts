import { bbox } from "@turf/turf";
import type { MultiPolygon, Polygon } from "geojson";
import { clipToLandWithMask } from "./landclip-core.mjs";
import { decodeIndex, hydratePolygon } from "./maskcodec.mjs";

/** Two-tier land clipping, shared by the clip worker and the main-thread
 *  fallback (src/lib/landmask.ts). Mirrors the old server heuristic in
 *  src/lib/landclip.mjs: city/metro-scale features clip against the FULL
 *  detailed mask (binary, lazily hydrated); country-scale features use the
 *  coarse mask, whose 2.2 km tolerance is invisible at that zoom. */

export type Area = Polygon | MultiPolygon;

// Versioned artifacts (see scripts/build-client-masks.mjs). /data/* is served
// immutable, so new content means new filenames — bump both together.
const COARSE_URL = "/data/land-mask-coarse-v2.json";
const DETAIL_URL = "/data/land-mask-detail-v2.bin";

/** Feature bbox diagonal (°) above which the coarse mask is used. */
const COARSE_DIAG = 3.5;

type MaskEntry = { b: [number, number, number, number]; c: Polygon["coordinates"] };
type DetailMask = { buffer: ArrayBuffer; index: ReturnType<typeof decodeIndex> };

// Per-tier memoized loads; a failure resets so a later selection can retry
// rather than pinning the failure for the session.
let coarsePromise: Promise<MaskEntry[] | null> | null = null;
let detailPromise: Promise<DetailMask | null> | null = null;

function loadCoarse(): Promise<MaskEntry[] | null> {
  if (!coarsePromise) {
    coarsePromise = fetch(COARSE_URL)
      .then((r) => (r.ok ? (r.json() as Promise<MaskEntry[]>) : null))
      .catch(() => null)
      .then((mask) => {
        if (!mask) coarsePromise = null;
        return mask;
      });
  }
  return coarsePromise;
}

function loadDetail(): Promise<DetailMask | null> {
  if (!detailPromise) {
    detailPromise = fetch(DETAIL_URL)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((buffer) => (buffer ? { buffer, index: decodeIndex(buffer) } : null))
      .catch(() => null)
      .then((mask) => {
        if (!mask) detailPromise = null;
        return mask;
      });
  }
  return detailPromise;
}

/** Warm both tiers in parallel (idempotent; called on search-field focus). */
export function prefetchTiers(): void {
  void loadCoarse();
  void loadDetail();
}

const overlaps = (
  a: [number, number, number, number],
  b: [number, number, number, number],
) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

/**
 * Clip a boundary to land with the tier matching its scale. Falls back
 * detailed → coarse → raw so a selection never fails on mask availability.
 */
export async function clipWithTiers(geometry: Area): Promise<Area> {
  try {
    const fb = bbox({ type: "Feature", geometry, properties: {} }) as [
      number, number, number, number,
    ];
    const diag = Math.hypot(fb[2] - fb[0], fb[3] - fb[1]);

    if (diag < COARSE_DIAG) {
      const detail = await loadDetail();
      if (detail) {
        // Hydrate only the polygons whose bbox overlaps the feature — a city
        // touches a handful of the 68k, so this stays tiny even though the
        // full mask is 1.75M vertices.
        const candidates: MaskEntry[] = [];
        for (const entry of detail.index) {
          if (!overlaps(fb, entry.b as [number, number, number, number])) continue;
          candidates.push({
            b: entry.b as MaskEntry["b"],
            c: hydratePolygon(detail.buffer, entry) as MaskEntry["c"],
          });
        }
        const clipped = clipToLandWithMask(geometry, candidates, {
          coarse: false,
        }) as Area | null;
        if (clipped) return clipped;
        // A null clip means "entirely over water" — for a real place that's a
        // mask gap, not truth; fall through to coarse rather than vanish.
      }
    }

    const coarse = await loadCoarse();
    if (coarse) {
      const clipped = clipToLandWithMask(geometry, coarse, {
        coarse: true,
      }) as Area | null;
      if (clipped) return clipped;
    }
    return geometry;
  } catch {
    return geometry;
  }
}
