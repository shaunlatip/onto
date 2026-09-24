import { area, bbox, centroid } from "@turf/turf";
import type {
  Feature,
  MultiPolygon,
  Polygon,
  Position,
} from "geojson";
import type { LocalRings, Place, PlaceGeometry } from "./types";
import { smoothGeometry } from "./smooth.mjs";
import { cleanShape } from "./shape.mjs";

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
/** Web Mercator's edge. MapLibre draws nothing past it — in the globe view
 *  too, whose tiles stop there and leave the poles as flat caps. */
const MAP_EDGE_LAT = 85.05;

/** Longest edge (in degrees) kept as a single segment. See densify(). */
const MAX_EDGE_DEG = 0.5;

function toMultiPolygonCoords(geom: PlaceGeometry): Position[][][] {
  return geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
}

/** Split long edges into short ones along the same lon/lat line. MapLibre draws
 *  every edge straight in lon/lat, so a long edge — the US–Canada border runs
 *  ~20° along one parallel — follows a different ground path once the outline
 *  is rotated somewhere else, costing ~1% of area. Short edges don't. Adds only
 *  collinear points, so the outline at home is unchanged. */
function densify(geom: PlaceGeometry): PlaceGeometry {
  const coordinates = toMultiPolygonCoords(geom).map((poly) =>
    poly.map((ring) => {
      const out: Position[] = [ring[0]];
      for (let i = 1; i < ring.length; i++) {
        const [lon0, lat0] = ring[i - 1];
        const [lon1, lat1] = ring[i];
        const n = Math.ceil(
          Math.max(Math.abs(lon1 - lon0), Math.abs(lat1 - lat0)) / MAX_EDGE_DEG,
        );
        for (let k = 1; k < n; k++)
          out.push([lon0 + ((lon1 - lon0) * k) / n, lat0 + ((lat1 - lat0) * k) / n]);
        out.push(ring[i]);
      }
      return out;
    }),
  );
  return { type: "MultiPolygon", coordinates };
}

/** Vertices as unit vectors in the frame where `center` is lon 0 / lat 0:
 *  spin by −λ₀ about the polar axis, then tilt by −φ₀ about the east axis. */
function toLocal(geom: PlaceGeometry, center: [number, number]): LocalRings {
  const lon0 = center[0] * D2R;
  const cos0 = Math.cos(center[1] * D2R);
  const sin0 = Math.sin(center[1] * D2R);
  return toMultiPolygonCoords(geom).map((poly) =>
    poly.map((ring) => {
      const out = new Float64Array(ring.length * 3);
      ring.forEach(([lon, lat], i) => {
        const l = lon * D2R - lon0;
        const cp = Math.cos(lat * D2R);
        const px = cp * Math.cos(l);
        const pz = Math.sin(lat * D2R);
        out[i * 3] = px * cos0 + pz * sin0;
        out[i * 3 + 1] = cp * Math.sin(l);
        out[i * 3 + 2] = pz * cos0 - px * sin0;
      });
      return out;
    }),
  );
}

/** How far north / south the centroid can go before some vertex crosses the
 *  map edge. Tilting to latitude φ puts a local vertex (x, y, z) at
 *  sin(lat) = x·sinφ + z·cosφ = ρ·sin(φ + α), with ρ = √(x²+z²), α = atan2(z, x),
 *  so each vertex reaches the edge at φ = asin(sin(edge)/ρ) − α. */
function latRangeOf(local: LocalRings, originLat: number): [number, number] {
  const s = Math.sin(MAP_EDGE_LAT * D2R);
  let north = MAP_EDGE_LAT;
  let south = -MAP_EDGE_LAT;
  for (const poly of local)
    for (const ring of poly)
      for (let i = 0; i < ring.length; i += 3) {
        const rho = Math.hypot(ring[i], ring[i + 2]);
        if (rho <= s) continue; // this vertex never gets that far from the equator
        const reach = Math.asin(s / rho) * R2D;
        const alpha = Math.atan2(ring[i + 2], ring[i]) * R2D;
        north = Math.min(north, reach - alpha);
        south = Math.max(south, -reach - alpha);
      }
  // Already past the edge at home (Antarctica, whose ring runs along the pole):
  // any tilt drags the outline around the pole, which no map can draw. Pin it
  // to its own latitude; it can still slide east–west.
  if (south > originLat || north < originLat) return [originLat, originLat];
  return [south, north];
}

/** Compute everything we need about a place once, at selection time:
 *  true area, centroid, and the outline in the centroid's frame. */
export function buildPlace(
  raw: Feature<PlaceGeometry>,
  meta: { id: string; label: string; shortLabel: string },
): Place {
  // base = clipped/simplified outline; area is measured here, BEFORE smoothing,
  // so Chaikin's tiny corner-cutting shrink never skews the reported size.
  const baseGeom = cleanShape(raw.geometry) as PlaceGeometry;
  const base: Feature<PlaceGeometry> = { ...raw, geometry: baseGeom };
  const trueAreaKm2 = area(base) / 1_000_000;
  const smoothed = smoothGeometry(baseGeom) as PlaceGeometry;
  // Centroid before densify(): it averages vertices, and the extra collinear
  // ones would drag it toward long straight borders.
  const c = centroid(smoothed).geometry.coordinates as [number, number];
  const feature: Feature<PlaceGeometry> = { ...raw, geometry: densify(smoothed) };

  const b = bbox(feature);
  const midLat = (b[1] + b[3]) / 2;
  const widthKm = Math.abs(b[2] - b[0]) * 111.32 * Math.cos(midLat * D2R);
  const heightKm = Math.abs(b[3] - b[1]) * 110.574;

  const local = toLocal(feature.geometry, c);

  return {
    id: meta.id,
    label: meta.label,
    shortLabel: meta.shortLabel,
    center: c,
    trueAreaKm2,
    widthKm,
    heightKm,
    feature,
    local,
    latRange: latRangeOf(local, c[1]),
  };
}

/** Where X's centroid actually lands for a requested `target`: latitude held
 *  inside the place's `latRange` so the outline never runs off the map. */
export function clampPlacement(
  place: Place,
  target: [number, number],
): [number, number] {
  const [south, north] = place.latRange;
  return [target[0], Math.min(north, Math.max(south, target[1]))];
}

/** The crux. Place X's true-size outline with its centroid at `target` by
 *  ROTATING it over the sphere: tilt the centroid's frame up to the target
 *  latitude, then spin it to the target longitude. A rotation is a rigid move
 *  of the real ground shape, so area, shape and north-up all hold exactly at
 *  any latitude. The result is ordinary lon/lat that MapLibre projects exactly
 *  as it projects the basemap beneath it, so it is the same for Mercator and
 *  the globe: on the globe X looks like itself anywhere; on Mercator it swells
 *  toward the poles exactly as much as the real land around it does.
 *  `grabScale` is a tiny multiplier for the press-to-lift feedback.
 *  A few trig calls per vertex — safe to call per frame. */
export function placeOverlay(
  place: Place,
  target: [number, number],
  grabScale = 1,
): Feature<MultiPolygon> {
  const [lonT, latT] = clampPlacement(place, target);
  if (place.latRange[0] === place.latRange[1]) return slideTo(place, lonT);
  const cosT = Math.cos(latT * D2R);
  const sinT = Math.sin(latT * D2R);

  const coordinates: Position[][][] = place.local.map((poly) =>
    poly.map((ring) => {
      const out: Position[] = new Array(ring.length / 3);
      let prevLon = lonT;
      for (let i = 0, j = 0; i < ring.length; i += 3, j++) {
        const x = ring[i];
        // lift: scale the offset from the centroid (the +x axis) in its tangent plane
        const y = ring[i + 1] * grabScale;
        const z = ring[i + 2] * grabScale;
        const xr = x * cosT - z * sinT;
        const zr = x * sinT + z * cosT;
        let lon = lonT + Math.atan2(y, xr) * R2D;
        // keep each ring continuous across ±180° (MapLibre wraps lon > 180 fine)
        if (lon - prevLon > 180) lon -= 360;
        else if (prevLon - lon > 180) lon += 360;
        prevLon = lon;
        out[j] = [lon, Math.atan2(zr, Math.hypot(xr, y)) * R2D];
      }
      return out;
    }),
  );

  return {
    type: "Feature",
    geometry: { type: "MultiPolygon", coordinates },
    properties: {},
  };
}

/** A latitude-pinned place moved east–west only. That move is exact as a plain
 *  longitude shift, and unlike the rotation it keeps a ring's run along the
 *  pole (every vertex the same point in 3D) intact. */
function slideTo(place: Place, lon: number): Feature<MultiPolygon> {
  const dLon = lon - place.center[0];
  return {
    type: "Feature",
    geometry: {
      type: "MultiPolygon",
      coordinates: toMultiPolygonCoords(place.feature.geometry).map((poly) =>
        poly.map((ring) => ring.map(([x, y]) => [x + dLon, y])),
      ),
    },
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
): Bounds {
  const yb = bbox(target.feature) as Bounds;
  const xb = bbox(placeOverlay(reference, at)) as Bounds;
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
