import type { MultiPolygon, Polygon } from "geojson";
import type { GeocodeResult } from "@/app/api/geocode/route";

/** Bundled metro / functional-urban-area polygons (GHS-FUA, JRC R2019A) for
 *  ~all global metros ≥ 1M population. Loaded once on first search. */

interface MetroResult extends GeocodeResult {
  /** lowercased name for matching */
  _search: string;
  pop: number;
}

interface MetroFeature {
  properties: { name: string; country: string; iso: string; pop: number };
  geometry: Polygon | MultiPolygon;
}

let metrosPromise: Promise<MetroResult[]> | null = null;

function toResult(f: MetroFeature): MetroResult {
  const raw = f.properties.name;
  const short = raw.split(" [")[0].trim();
  return {
    id: `metro-${f.properties.iso}-${short}`,
    label: `${short} metropolitan area · ${f.properties.country}`,
    shortLabel: short,
    kind: "metro area",
    geometry: f.geometry,
    _search: raw.toLowerCase(),
    pop: f.properties.pop,
  };
}

async function loadMetros(): Promise<MetroResult[]> {
  if (!metrosPromise) {
    metrosPromise = fetch("/data/metros.geojson")
      .then((r) => r.json())
      .then((fc: { features: MetroFeature[] }) => fc.features.map(toResult))
      .catch(() => []);
  }
  return metrosPromise;
}

/** Up to `limit` metros whose name contains the query, largest first. */
export async function searchMetros(
  query: string,
  limit = 3,
): Promise<GeocodeResult[]> {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  const all = await loadMetros();
  return all
    .filter((m) => m._search.includes(needle))
    .sort((a, b) => b.pop - a.pop)
    .slice(0, limit)
    .map(({ _search, pop, ...r }) => {
      void _search;
      void pop;
      return r;
    });
}
