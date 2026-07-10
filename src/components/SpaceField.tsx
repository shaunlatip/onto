"use client";

import { useMemo } from "react";
import { starfieldDataUri } from "@/lib/starfield";

const STATIC_TILE = 760;
const SLOW_TILE = 640;
const MID_TILE = 560;
const FAST_TILE = 480;

/** Sits behind SpanMap so stars only show through the void around the globe
 *  (and above/below the mercator bounds) — the map's own opaque fill covers
 *  the rest. Four tiling layers — one fixed, three drifting at different very
 *  slow speeds (CSS background-position animation, no JS loop) — for a subtle
 *  depth parallax. The fastest layer is capped at the same top speed as the
 *  original two-layer version; all four still sum to the same star budget. */
export default function SpaceField() {
  const layerStatic = useMemo(
    () =>
      starfieldDataUri({
        size: STATIC_TILE,
        count: 55,
        minRadius: 0.35,
        maxRadius: 0.85,
        minOpacity: 0.15,
        maxOpacity: 0.4,
        seed: 1,
      }),
    [],
  );
  const slow = useMemo(
    () =>
      starfieldDataUri({
        size: SLOW_TILE,
        count: 40,
        minRadius: 0.4,
        maxRadius: 0.95,
        minOpacity: 0.22,
        maxOpacity: 0.5,
        seed: 2,
      }),
    [],
  );
  const mid = useMemo(
    () =>
      starfieldDataUri({
        size: MID_TILE,
        count: 28,
        minRadius: 0.55,
        maxRadius: 1.2,
        minOpacity: 0.32,
        maxOpacity: 0.62,
        seed: 3,
      }),
    [],
  );
  const fast = useMemo(
    () =>
      starfieldDataUri({
        size: FAST_TILE,
        count: 17,
        minRadius: 0.8,
        maxRadius: 1.7,
        minOpacity: 0.45,
        maxOpacity: 0.85,
        seed: 4,
      }),
    [],
  );

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url("${layerStatic}")`,
          backgroundRepeat: "repeat",
          backgroundSize: `${STATIC_TILE}px ${STATIC_TILE}px`,
        }}
      />
      <div
        className="absolute inset-0 animate-[starfield-drift-slow_380s_linear_infinite]"
        style={{
          backgroundImage: `url("${slow}")`,
          backgroundRepeat: "repeat",
          backgroundSize: `${SLOW_TILE}px ${SLOW_TILE}px`,
        }}
      />
      <div
        className="absolute inset-0 animate-[starfield-drift-mid_260s_linear_infinite]"
        style={{
          backgroundImage: `url("${mid}")`,
          backgroundRepeat: "repeat",
          backgroundSize: `${MID_TILE}px ${MID_TILE}px`,
        }}
      />
      <div
        className="absolute inset-0 animate-[starfield-drift-fast_170s_linear_infinite]"
        style={{
          backgroundImage: `url("${fast}")`,
          backgroundRepeat: "repeat",
          backgroundSize: `${FAST_TILE}px ${FAST_TILE}px`,
        }}
      />
    </div>
  );
}
