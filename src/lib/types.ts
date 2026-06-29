import type { Feature, Polygon, MultiPolygon } from "geojson";

export type PlaceGeometry = Polygon | MultiPolygon;

/** Normalized vertex offsets relative to a place's centroid, stored as
 *  MultiPolygon nesting (polygons → rings → [Δlon, Δlat]). Precomputed once
 *  on select so the drag hot path is a pure multiply-add, no Turf. */
export type Offsets = [number, number][][][];

export interface Place {
  id: string;
  /** Full disambiguated name, e.g. "Boston, Massachusetts, United States". */
  label: string;
  /** Short name for the sentence + readout, e.g. "Boston". */
  shortLabel: string;
  /** [lon, lat] centroid of the real-world geometry. */
  center: [number, number];
  /** Origin-centroid latitude φ₀ — the basis for the Mercator size correction. */
  originLat: number;
  /** Geodesic ("true") area in square kilometers. */
  trueAreaKm2: number;
  /** True east-west and north-south extent of the bounding box, in km. */
  widthKm: number;
  heightKm: number;
  /** Original geometry at its real-world location (used for the static target Y). */
  feature: Feature<PlaceGeometry>;
  /** Centroid-relative offsets for fast overlay placement (used for the moving X). */
  offsets: Offsets;
}
