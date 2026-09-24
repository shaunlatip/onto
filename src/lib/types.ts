import type { Feature, Polygon, MultiPolygon } from "geojson";

export type PlaceGeometry = Polygon | MultiPolygon;

/** A place's vertices as unit vectors on the sphere, in a frame where its
 *  centroid sits at lon 0 / lat 0 (the +x axis; +y east, +z north). MultiPolygon
 *  nesting (polygons → rings), each ring an interleaved xyz array. Precomputed
 *  once on select so dragging is one rotation per vertex, no Turf. */
export type LocalRings = Float64Array[][];

export interface Place {
  id: string;
  /** Full disambiguated name, e.g. "Boston, Massachusetts, United States". */
  label: string;
  /** Short name for the sentence + readout, e.g. "Boston". */
  shortLabel: string;
  /** [lon, lat] centroid of the real-world geometry. */
  center: [number, number];
  /** Geodesic ("true") area in square kilometers. */
  trueAreaKm2: number;
  /** True east-west and north-south extent of the bounding box, in km. */
  widthKm: number;
  heightKm: number;
  /** Original geometry at its real-world location (used for the static target Y). */
  feature: Feature<PlaceGeometry>;
  /** Outline in its centroid's frame, for fast overlay placement (the moving X). */
  local: LocalRings;
  /** Centroid latitudes [south, north] between which the placed outline stays
   *  inside the map's ±85.05° edge. Always includes the place's own latitude. */
  latRange: [number, number];
}
