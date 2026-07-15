/** Single source of truth for the basemap + accent colors. */

export interface MapStyleOption {
  key: string;
  label: string;
  /** Shown in the style picker under the "Onto" menu. */
  description: string;
  url: string;
}

/** CARTO's three native basemap styles — same CDN, no API key, just a
 *  different style.json. Ordered from quietest to loudest. */
export const MAP_STYLES: MapStyleOption[] = [
  {
    key: "positron",
    label: "Positron",
    description: "Minimal grayscale.",
    url: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  },
  {
    key: "voyager",
    label: "Voyager",
    description: "Warmer and more colorful, still restrained.",
    url: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
  },
  {
    key: "dark-matter",
    label: "Dark Matter",
    description: "Dark mode.",
    url: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  },
];

export const DEFAULT_MAP_STYLE_KEY = "voyager";

/** Data credits. All three basemaps are CARTO styles built on OpenStreetMap, so
 *  the basemap attribution is constant; the metro line covers our overlay data.
 *  Rendered as a line at the bottom of the Onto menu (desktop panel + mobile
 *  sheet) rather than floating on the map. */
export const ATTRIBUTION: ReadonlyArray<{ label: string; href?: string }> = [
  {
    label: "© OpenStreetMap contributors",
    href: "https://www.openstreetmap.org/copyright",
  },
  { label: "© CARTO", href: "https://carto.com/attributions" },
  {
    label: "Metro areas: GHS-FUA, European Commission JRC (R2019A)",
    href: "https://ghsl.jrc.ec.europa.eu/",
  },
];

export function mapStyleUrl(key: string): string {
  return (
    MAP_STYLES.find((s) => s.key === key) ??
    MAP_STYLES.find((s) => s.key === DEFAULT_MAP_STYLE_KEY)!
  ).url;
}

/** Accent colors for the two outlines. Mirrors the --span-* tokens in
 *  globals.css; MapLibre paint needs plain color strings so they live here too. */
export const ACCENTS = {
  /** Y — the new place you're learning. Emerald. */
  target: {
    line: "#0f9d63",
    fill: "#10a36b",
    fillOpacity: 0.1,
    lineOpacity: 0.95,
    lineWidth: 1.5,
  },
  /** X — the familiar place, laid on top and draggable. Amber. */
  reference: {
    line: "#d98209",
    fill: "#f5a623",
    fillOpacity: 0.32,
    lineOpacity: 1,
    lineWidth: 2,
  },
} as const;

/** Whole-world resting view before anything is chosen. */
export const INITIAL_VIEW = {
  longitude: -25,
  latitude: 22,
  zoom: 1.3,
} as const;

export const FIT_PADDING = 96;

/** Cap on how far a single-place fit zooms in — kept in sync between the
 *  fitBounds call and the tile prefetch that warms its landing tiles. */
export const FIT_MAX_ZOOM = 12;
