import { blobOfArea, buildPlace } from "./geo";
import type { Place } from "./types";

/** Curated offline fallback / demo fixtures. Areas are real (km²); shapes are
 *  honest-area blobs (live geocoding provides true boundaries). Cities only —
 *  a blob reads fine for a city, absurd for a country. */
const CURATED: Array<{
  id: string;
  label: string;
  shortLabel: string;
  center: [number, number];
  areaKm2: number;
}> = [
  { id: "boston", label: "Boston, Massachusetts", shortLabel: "Boston", center: [-71.057, 42.36], areaKm2: 125 },
  { id: "cambridge", label: "Cambridge, Massachusetts", shortLabel: "Cambridge", center: [-71.106, 42.375], areaKm2: 18.6 },
  { id: "sf", label: "San Francisco, California", shortLabel: "San Francisco", center: [-122.437, 37.758], areaKm2: 121 },
  { id: "oakland", label: "Oakland, California", shortLabel: "Oakland", center: [-122.246, 37.792], areaKm2: 145.8 },
  { id: "berkeley", label: "Berkeley, California", shortLabel: "Berkeley", center: [-122.273, 37.871], areaKm2: 45.9 },
  { id: "manhattan", label: "Manhattan, New York", shortLabel: "Manhattan", center: [-73.968, 40.776], areaKm2: 59.1 },
  { id: "singapore", label: "Singapore", shortLabel: "Singapore", center: [103.82, 1.352], areaKm2: 728 },
];

export const CURATED_PLACES: Place[] = CURATED.map((c, i) =>
  buildPlace(blobOfArea(c.center, c.areaKm2, i + 1), {
    id: c.id,
    label: c.label,
    shortLabel: c.shortLabel,
  }),
);

export function curatedById(id: string): Place | undefined {
  return CURATED_PLACES.find((p) => p.id === id);
}
