/** Single source of truth for the basemap + accent colors.
 *  Swap BASEMAP_STYLE_URL to OpenFreeMap or a MapTiler style in one line. */

export const BASEMAP_STYLE_URL =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

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
