// Shared "liquid glass" model — the parameters every glass surface reads, plus
// the CSS/SVG it turns into. Driven live by the in-app controls menu and reused
// by the /glass lab.
//
// Four branches, in order of "more real glass, less just frosted":
//  frosted    — blur + tint + border + shadow only (cross-browser fallback)
//  turbulence — + a uniform feTurbulence warp of the backdrop (Chromium)
//  lens       — + edge-concentrated displacement = real rim refraction (Chromium)
//  chromatic  — + per-channel R/B offset → prismatic rim (Chromium)
export type GlassBranch = "frosted" | "turbulence" | "lens" | "chromatic";

export interface GlassConfig {
  branch: GlassBranch;
  blur: number; // backdrop blur px
  tint: number; // white fill opacity 0..1
  saturate: number; // backdrop saturation
  scale: number; // displacement strength (turbulence + lens)
  freq: number; // turbulence base frequency
  bevel: number; // lens rim width px
  chroma: number; // chromatic aberration px
  border: number; // rim opacity 0..1
  shadow: number; // elevation depth multiplier
  specular: number; // inset edge-highlight intensity
}

// The chosen house style: chromatic edge-refraction (Chromium). Non-Chromium
// browsers fall back to a plain frosted blur via an @supports rule in
// globals.css. `bevel`/`freq` aren't live sliders; they hold tuned defaults.
export const DEFAULT_GLASS: GlassConfig = {
  branch: "chromatic",
  blur: 6,
  tint: 0.5,
  saturate: 1.8,
  scale: 40,
  freq: 0.004,
  bevel: 18,
  chroma: 3,
  border: 0.7,
  shadow: 0.5,
  specular: 0.8,
};

/** The `backdrop-filter` value for a config. Non-frosted branches reference an
 *  SVG filter by id (rendered per glass instance). */
export function glassBackdropFilter(cfg: GlassConfig, filterId: string): string {
  if (cfg.branch === "frosted")
    return `blur(${cfg.blur}px) saturate(${cfg.saturate})`;
  return `url(#${filterId}) blur(${cfg.blur}px) saturate(${cfg.saturate})`;
}

/** Elevation drop-shadow + inset specular highlights, scaled by the config. */
export function glassBoxShadow(cfg: GlassConfig): string {
  const s = cfg.shadow;
  const sp = cfg.specular;
  return [
    `0 ${Math.round(26 * s)}px ${Math.round(70 * s)}px -24px rgba(18,20,26,${(0.42 * s).toFixed(3)})`,
    `0 ${Math.round(3 * s)}px ${Math.round(10 * s)}px -4px rgba(18,20,26,${(0.18 * s).toFixed(3)})`,
    `inset 1.5px 1.5px 0 rgba(255,255,255,${(0.9 * sp).toFixed(3)})`,
    `inset -1px -1px 1px rgba(255,255,255,${(0.55 * sp).toFixed(3)})`,
    `inset 0 0 16px rgba(255,255,255,${(0.45 * sp).toFixed(3)})`,
    `inset 0 -2px 4px rgba(18,20,26,0.05)`,
  ].join(", ");
}

/** Sliders shown in the controls menu. `branches` limits a slider to certain
 *  approaches (e.g. chromatic only appears for the chromatic branch). */
export const GLASS_SLIDERS: {
  key: keyof GlassConfig;
  label: string;
  min: number;
  max: number;
  step: number;
  branches?: GlassBranch[];
  fmt?: (v: number) => string;
}[] = [
  { key: "blur", label: "Blur", min: 0, max: 30, step: 0.5, fmt: (v) => `${v}px` },
  { key: "tint", label: "Tint", min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) },
  { key: "saturate", label: "Saturate", min: 1, max: 2.6, step: 0.05, fmt: (v) => `${v.toFixed(2)}×` },
  { key: "border", label: "Border", min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) },
  { key: "shadow", label: "Shadow", min: 0, max: 1.5, step: 0.05, fmt: (v) => v.toFixed(2) },
  { key: "specular", label: "Specular", min: 0, max: 1.2, step: 0.01, fmt: (v) => v.toFixed(2) },
  { key: "scale", label: "Displace", min: 0, max: 90, step: 1, branches: ["turbulence", "lens", "chromatic"] },
  { key: "freq", label: "Turb. freq", min: 0.001, max: 0.03, step: 0.001, branches: ["turbulence"], fmt: (v) => v.toFixed(3) },
  { key: "chroma", label: "Chromatic", min: 0, max: 20, step: 0.5, branches: ["chromatic"], fmt: (v) => `${v}px` },
  // NOTE: "Rim bevel" is intentionally not a live slider. It rewrites the
  // displacement normal-map *image*, and Chromium won't re-rasterize a
  // backdrop-filter when only its feImage href changes (numeric attrs like
  // scale do propagate). Bevel stays at the tuned DEFAULT_GLASS value.
];

/** Cheap sampled string hash. Used to rotate a filter's id when its contents
 *  (e.g. the feImage normal-map data URL) change — Chromium caches a
 *  backdrop-filter by its url() id and won't re-rasterize an in-place edit. */
export function quickHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i += 64) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export const GLASS_BRANCHES: { key: GlassBranch; label: string }[] = [
  { key: "frosted", label: "Frosted" },
  { key: "turbulence", label: "Turbulence" },
  { key: "lens", label: "Edge lens" },
  { key: "chromatic", label: "Chromatic" },
];
