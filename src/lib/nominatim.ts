import type { GeocodeResult } from "@/app/api/geocode/route";
import { searchMetros } from "./metros";
import { searchRegions } from "./regions";
import { CURATED_PLACES } from "./places";

export type { GeocodeResult };

const clientCache = new Map<string, GeocodeResult[]>();
const CLIENT_CACHE_MAX = 50;

/** Merge bundled metros + curated regions (which Nominatim lacks) ahead of the
 *  live OSM admin results. */
export async function geocode(
  q: string,
  signal: AbortSignal,
): Promise<GeocodeResult[]> {
  const [extras, nominatim] = await Promise.all([
    Promise.all([searchRegions(q), searchMetros(q)]).then(([a, b]) => [
      ...a,
      ...b,
    ]),
    fetchNominatim(q, signal),
  ]);
  // Only a curated REGION suppresses an identical-named OSM hit (we don't want
  // the hand-built region AND a worse OSM copy of it). A metro must NOT suppress
  // the city: "Boston" / "Dallas" should list BOTH the city and the metro area —
  // they're different places (city ~125 km² vs metro ~thousands).
  const regionNames = new Set(
    extras
      .filter((e) => e.kind === "region")
      .map((e) => e.shortLabel.toLowerCase()),
  );
  return [
    ...extras,
    ...nominatim.filter((n) => !regionNames.has(n.shortLabel.toLowerCase())),
  ];
}

async function fetchNominatim(
  q: string,
  signal: AbortSignal,
): Promise<GeocodeResult[]> {
  const key = q.toLowerCase();
  const cached = clientCache.get(key);
  if (cached) return cached;

  try {
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`, {
      signal,
    });
    if (!res.ok) return curatedFallback(q);
    const data = (await res.json()) as { results: GeocodeResult[] };
    const results = data.results.length ? data.results : curatedFallback(q);
    if (clientCache.size >= CLIENT_CACHE_MAX) {
      clientCache.delete(clientCache.keys().next().value!);
    }
    clientCache.set(key, results);
    return results;
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    return curatedFallback(q);
  }
}

export async function clipSelectedGeometry(
  geometry: NonNullable<GeocodeResult["geometry"]>,
  signal?: AbortSignal,
): Promise<NonNullable<GeocodeResult["geometry"]>> {
  try {
    const res = await fetch("/api/geocode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ geometry }),
      signal,
    });
    if (!res.ok) return geometry;
    const data = (await res.json()) as { geometry?: GeocodeResult["geometry"] };
    return data.geometry ?? geometry;
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    return geometry;
  }
}

/** If the network is down, still let the curated cities resolve. */
function curatedFallback(q: string): GeocodeResult[] {
  const needle = q.toLowerCase();
  return CURATED_PLACES.filter((p) =>
    p.shortLabel.toLowerCase().includes(needle),
  ).map((p) => ({
    id: `curated-${p.id}`,
    label: p.label,
    shortLabel: p.shortLabel,
    kind: "city",
    geometry: p.feature.geometry,
    needsLandClip: false,
  }));
}
