import type { MultiPolygon, Polygon } from "geojson";
import type { GeocodeResult } from "@/app/api/geocode/route";

/** Curated multi-unit regions (Bay Area, New England, EU) that OSM doesn't
 *  return as a single polygon. Pre-built by scripts/build-regions.mjs. */

interface RegionFeature {
  properties: { name: string; short: string; country: string };
  geometry: Polygon | MultiPolygon;
}
interface RegionResult extends GeocodeResult {
  _search: string;
}

let promise: Promise<RegionResult[]> | null = null;

function toResult(f: RegionFeature): RegionResult {
  return {
    id: `region-${f.properties.short}`,
    label: `${f.properties.name} · ${f.properties.country}`,
    shortLabel: f.properties.short,
    kind: "region",
    geometry: f.geometry,
    _search: `${f.properties.name} ${f.properties.short}`.toLowerCase(),
  };
}

async function load(): Promise<RegionResult[]> {
  if (!promise) {
    promise = fetch("/data/regions.geojson")
      .then((r) => r.json())
      .then((fc: { features: RegionFeature[] }) => fc.features.map(toResult))
      .catch(() => []);
  }
  return promise;
}

export async function searchRegions(
  query: string,
  limit = 3,
): Promise<GeocodeResult[]> {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  const all = await load();
  return all
    .filter((r) => r._search.includes(needle))
    .slice(0, limit)
    .map(({ _search, ...r }) => {
      void _search;
      return r;
    });
}
