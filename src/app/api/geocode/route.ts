import type { Geometry, MultiPolygon, Polygon } from "geojson";

/** Proxy OpenStreetMap Nominatim:
 *  - the browser can't set the User-Agent Nominatim's policy requires
 *  - lets us cache and keep the upstream + contact off the client
 *  Attribution ("© OpenStreetMap contributors") is shown in the UI. */

export interface GeocodeResult {
  id: string;
  /** Full disambiguated name. */
  label: string;
  /** Short leading token, e.g. "Boston". */
  shortLabel: string;
  /** addresstype/class for a small badge, e.g. "city", "country". */
  kind: string;
  /** Polygon/MultiPolygon if this place has a usable boundary, else null. */
  geometry: Polygon | MultiPolygon | null;
  /** Whether selection should clip this Nominatim boundary to land. */
  needsLandClip: boolean;
}

// Nominatim's policy requires identifying contact info and blocks fake/example
// contacts (an "example.com" UA gets a hard 403). Point this at the real repo
// or a contact URL before deploying.
const USER_AGENT = "Onto/0.1 (https://github.com/shaunlatip/onto)";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";

// Small in-memory cache (per server instance). Nominatim asks for ≤1 req/s;
// debounce + this cache keep us well under for a portfolio tool.
const cache = new Map<string, GeocodeResult[]>();
const CACHE_MAX = 200;
const SEARCH_HEADERS = {
  "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
};

function isAreaGeometry(g: Geometry | undefined): g is Polygon | MultiPolygon {
  return !!g && (g.type === "Polygon" || g.type === "MultiPolygon");
}

interface NominatimItem {
  osm_type?: string;
  osm_id?: number;
  display_name?: string;
  name?: string;
  type?: string;
  class?: string;
  addresstype?: string;
  geojson?: Geometry;
}

function resultsResponse(results: GeocodeResult[]) {
  return Response.json({ results }, { headers: SEARCH_HEADERS });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return resultsResponse([]);

  const key = q.toLowerCase();
  if (cache.has(key)) return resultsResponse(cache.get(key)!);

  const url = new URL(NOMINATIM);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("polygon_geojson", "1");
  // light server-side simplification only; client adapts tolerance to feature
  // size so small lakes stay smooth instead of jagged.
  url.searchParams.set("polygon_threshold", "0.0006");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "6");
  url.searchParams.set("q", q);

  let items: NominatimItem[] = [];
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" },
      // our own in-memory cache handles dedup; skip Next's persistent data
      // cache so a transient upstream failure can't get pinned for a day
      cache: "no-store",
    });
    if (res.ok) items = (await res.json()) as NominatimItem[];
  } catch {
    return resultsResponse([]);
  }

  const results: GeocodeResult[] = items.map((it) => {
    const label = it.display_name ?? it.name ?? "Unknown";
    const raw = isAreaGeometry(it.geojson) ? it.geojson : null;
    return {
      id: `${it.osm_type ?? "n"}${it.osm_id ?? label}`,
      label,
      shortLabel: it.name ?? label.split(",")[0]?.trim() ?? label,
      kind: it.addresstype ?? it.type ?? it.class ?? "place",
      geometry: raw,
      needsLandClip: !!raw,
    };
  });

  // boundaries first, then points; keep insertion order within each group
  results.sort((a, b) => Number(!!b.geometry) - Number(!!a.geometry));

  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(key, results);

  return resultsResponse(results);
}
