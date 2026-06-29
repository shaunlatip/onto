import { area, bbox, centroid } from "@turf/turf";
import type {
  Feature,
  MultiPolygon,
  Polygon,
  Position,
} from "geojson";
import type { Offsets, Place, PlaceGeometry } from "./types";
import { smoothGeometry } from "./smooth.mjs";
import { cleanShape } from "./shape.mjs";

const D2R = Math.PI / 180;
/** cos(lat) → 0 at the poles makes the size correction blow up; clamp. */
const MAX_LAT = 80;

const clampLat = (lat: number) => Math.min(MAX_LAT, Math.max(-MAX_LAT, lat));

function toMultiPolygonCoords(geom: PlaceGeometry): Position[][][] {
  return geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
}

/** Compute everything we need about a place once, at selection time:
 *  true area, centroid latitude φ₀, and centroid-relative vertex offsets. */
export function buildPlace(
  raw: Feature<PlaceGeometry>,
  meta: { id: string; label: string; shortLabel: string },
): Place {
  // base = clipped/simplified outline; area is measured here, BEFORE smoothing,
  // so Chaikin's tiny corner-cutting shrink never skews the reported size.
  const baseGeom = cleanShape(raw.geometry) as PlaceGeometry;
  const base: Feature<PlaceGeometry> = { ...raw, geometry: baseGeom };
  const trueAreaKm2 = area(base) / 1_000_000;
  const feature: Feature<PlaceGeometry> = {
    ...raw,
    geometry: smoothGeometry(baseGeom) as PlaceGeometry,
  };
  const c = centroid(feature).geometry.coordinates as [number, number];

  const b = bbox(feature);
  const midLat = (b[1] + b[3]) / 2;
  const widthKm = Math.abs(b[2] - b[0]) * 111.32 * Math.cos(midLat * D2R);
  const heightKm = Math.abs(b[3] - b[1]) * 110.574;

  const offsets: Offsets = toMultiPolygonCoords(feature.geometry).map((poly) =>
    poly.map((ring) =>
      ring.map(([lon, lat]) => [lon - c[0], lat - c[1]] as [number, number]),
    ),
  );

  return {
    id: meta.id,
    label: meta.label,
    shortLabel: meta.shortLabel,
    center: c,
    originLat: c[1],
    trueAreaKm2,
    widthKm,
    heightKm,
    feature,
    offsets,
  };
}

/** The crux. Place X's true-size outline with its centroid at `target`.
 *  k = cos(φ₀)/cos(φ_t). Longitude always scales by k (a degree of longitude
 *  shrinks toward the poles, so this keeps the east-west GROUND extent constant).
 *  - Mercator is conformal, so latitude also scales by k → shape + true area hold.
 *  - On the globe latitude scales by 1 → preserves ground shape AND true area
 *    (uniform scaling there would shear the shape near the poles).
 *  `grabScale` is a tiny multiplier for the press-to-lift feedback.
 *  Pure multiply-add — safe to call per frame. */
export function placeOverlay(
  place: Place,
  target: [number, number],
  mercator = true,
  grabScale = 1,
): Feature<MultiPolygon> {
  const lonT = target[0];
  const latT = clampLat(target[1]);
  const k = Math.cos(place.originLat * D2R) / Math.cos(latT * D2R);
  const sx = k * grabScale;
  const sy = (mercator ? k : 1) * grabScale;

  const coordinates: Position[][][] = place.offsets.map((poly) =>
    poly.map((ring) =>
      ring.map(([dlon, dlat]) => [
        lonT + dlon * sx,
        // keep latitudes valid even for huge scaled shapes near the poles —
        // an out-of-range value crashes MapLibre's fitBounds.
        Math.max(-89.9, Math.min(89.9, latT + dlat * sy)),
      ]),
    ),
  );

  return {
    type: "Feature",
    geometry: { type: "MultiPolygon", coordinates },
    properties: {},
  };
}

/** Web-Mercator-safe bounds: latitudes clamped so fitBounds never throws. */
export function clampBounds(b: Bounds): Bounds {
  const lat = (v: number) => Math.max(-85, Math.min(85, v));
  return [b[0], lat(b[1]), b[2], lat(b[3])];
}

export type Bounds = [number, number, number, number];

export function featureBounds(feature: Feature): Bounds {
  return bbox(feature) as Bounds;
}

/** Bounding box covering both Y (static) and X (placed at `target`). */
export function unionBounds(
  target: Place,
  reference: Place,
  at: [number, number],
  mercator = true,
): Bounds {
  const yb = bbox(target.feature) as Bounds;
  const xb = bbox(placeOverlay(reference, at, mercator)) as Bounds;
  return [
    Math.min(yb[0], xb[0]),
    Math.min(yb[1], xb[1]),
    Math.max(yb[2], xb[2]),
    Math.max(yb[3], xb[3]),
  ];
}

const areaFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

const KM2_PER_MI2 = 2.589988;

export type AreaUnit = "km" | "mi";

/** Format an area in the chosen unit, e.g. "47 km²" or "18 mi²". */
export function formatArea(km2: number, unit: AreaUnit): string {
  const value = unit === "km" ? km2 : km2 / KM2_PER_MI2;
  const label = unit === "km" ? "km²" : "mi²";
  if (value < 10) return `${value.toFixed(1)} ${label}`;
  return `${areaFmt.format(Math.round(value))} ${label}`;
}

export function formatMultiple(n: number): string {
  if (n >= 100) return `${areaFmt.format(Math.round(n))}×`;
  if (n >= 10) return `${n.toFixed(0)}×`;
  return `${n.toFixed(n < 2 ? 2 : 1)}×`;
}

export interface MeasurePair {
  /** Reference (familiar) place measure. */
  familiar: number;
  /** Target (new) place measure. */
  new: number;
}

export interface Readout {
  newName: string;
  familiarName: string;
  /** km² */
  size: MeasurePair;
  /** km (east-west extent) */
  width: MeasurePair;
  /** km (north-south extent) */
  height: MeasurePair;
}

/** Raw measures for both places; the component picks size/width/height + unit. */
export function readout(reference: Place, target: Place): Readout {
  return {
    newName: target.shortLabel,
    familiarName: reference.shortLabel,
    size: { familiar: reference.trueAreaKm2, new: target.trueAreaKm2 },
    width: { familiar: reference.widthKm, new: target.widthKm },
    height: { familiar: reference.heightKm, new: target.heightKm },
  };
}

/** Make a roughly-correct-area blob centered at a point — used only for the
 *  curated offline fallback set, where we want honest sizes without shipping
 *  full boundary data. Live geocoding provides real shapes. */
export function blobOfArea(
  center: [number, number],
  areaKm2: number,
  seed = 1,
): Feature<Polygon> {
  const [lon, lat] = center;
  // radius (km) of a circle with this area, then jitter into an irregular ring
  const rKm = Math.sqrt(areaKm2 / Math.PI);
  const kmPerDegLat = 110.574;
  const kmPerDegLon = 111.32 * Math.cos(lat * D2R);
  const n = 14;
  const ring: Position[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const jitter = 0.78 + 0.34 * Math.abs(Math.sin(a * 2.3 + seed));
    const dLat = (Math.sin(a) * rKm * jitter) / kmPerDegLat;
    const dLon = (Math.cos(a) * rKm * jitter) / kmPerDegLon;
    ring.push([lon + dLon, lat + dLat]);
  }
  ring.push(ring[0]);
  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [ring] },
    properties: {},
  };
}
