"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useGlass } from "@/components/GlassConfig";
import {
  glassBackdropFilter,
  glassBoxShadow,
  quickHash,
  type GlassConfig,
} from "@/lib/glass";
import { makeNormalMap } from "@/lib/normalMap";

/** The per-instance SVG filter for a non-frosted branch. */
function GlassFilterDef({
  cfg,
  id,
  normalMap,
}: {
  cfg: GlassConfig;
  id: string;
  normalMap: string;
}) {
  if (cfg.branch === "turbulence") {
    return (
      <filter id={id} x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency={`${cfg.freq} ${cfg.freq}`} numOctaves={2} seed={11} result="noise" />
        <feGaussianBlur in="noise" stdDeviation={1} result="nb" />
        <feDisplacementMap in="SourceGraphic" in2="nb" scale={cfg.scale} xChannelSelector="R" yChannelSelector="G" />
      </filter>
    );
  }
  if (!normalMap) return <filter id={id} />; // map not ready yet → no-op (frosted)
  const img = (
    <feImage href={normalMap} preserveAspectRatio="none" x="0%" y="0%" width="100%" height="100%" result="nmap" />
  );
  if (cfg.branch === "lens") {
    return (
      <filter id={id} x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
        {img}
        <feDisplacementMap in="SourceGraphic" in2="nmap" scale={cfg.scale} xChannelSelector="R" yChannelSelector="G" />
      </filter>
    );
  }
  return (
    <filter id={id} x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
      {img}
      <feDisplacementMap in="SourceGraphic" in2="nmap" scale={cfg.scale + cfg.chroma} xChannelSelector="R" yChannelSelector="G" result="dR" />
      <feDisplacementMap in="SourceGraphic" in2="nmap" scale={cfg.scale} xChannelSelector="R" yChannelSelector="G" result="dG" />
      <feDisplacementMap in="SourceGraphic" in2="nmap" scale={cfg.scale - cfg.chroma} xChannelSelector="R" yChannelSelector="G" result="dB" />
      <feColorMatrix in="dR" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="rO" />
      <feColorMatrix in="dG" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="gO" />
      <feColorMatrix in="dB" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="bO" />
      <feComposite in="rO" in2="gO" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="rg" />
      <feComposite in="rg" in2="bO" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" />
    </filter>
  );
}

interface GlassProps {
  children: ReactNode;
  className?: string;
  /** Clip children to the rounded box. Off when a child (e.g. a dropdown) must
   *  overflow and float above other content. */
  clip?: boolean;
  /** Kept for back-compat; the look is now driven globally by the glass config. */
  refract?: boolean;
}

export function Glass({ children, className, clip = true }: GlassProps) {
  const { cfg } = useGlass();
  const ref = useRef<HTMLDivElement>(null);
  const rawId = useId();

  const needsMap = cfg.branch === "lens" || cfg.branch === "chromatic";
  const [size, setSize] = useState({ w: 0, h: 0, r: 0 });
  const [normalMap, setNormalMap] = useState("");

  // Track the element's box + corner radius so the edge normal map matches it.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const r = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
      const next = { w: Math.round(rect.width), h: Math.round(rect.height), r: Math.round(r) };
      setSize((s) => (s.w === next.w && s.h === next.h && s.r === next.r ? s : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Regenerate the normal map after the size settles (debounced so the
  // composer's width animation doesn't thrash the canvas; feImage stretches the
  // slightly-stale map in the meantime).
  useEffect(() => {
    if (!needsMap || size.w < 2 || size.h < 2) return;
    // setState lives in the timeout callback (not the effect body) so it doesn't
    // trip the cascading-render rule; the debounce also smooths the composer's
    // width animation.
    const t = setTimeout(() => {
      setNormalMap(makeNormalMap(size.w, size.h, size.r, cfg.bevel));
    }, 110);
    return () => clearTimeout(t);
  }, [needsMap, size.w, size.h, size.r, cfg.bevel]);

  // Rotate the filter id whenever the filter's contents change, so the
  // backdrop-filter re-rasterizes (Chromium caches it by url() id). The normal
  // map changes on bevel tweaks AND when the composer chip resizes on selection.
  const sig =
    cfg.branch === "frosted"
      ? "f"
      : `${cfg.branch.charAt(0)}${cfg.scale}f${Math.round(cfg.freq * 1000)}c${cfg.chroma}h${quickHash(normalMap)}`;
  const filterId = `glass${rawId.replace(/[^a-zA-Z0-9]/g, "")}${sig}`.replace(/[^a-zA-Z0-9]/g, "");

  const bf = glassBackdropFilter(cfg, filterId);

  return (
    <div
      ref={ref}
      className={cn("span-glass relative isolate", clip && "overflow-hidden", className)}
      style={{
        background: `rgba(255,255,255,${cfg.tint})`,
        WebkitBackdropFilter: bf,
        backdropFilter: bf,
        border: `1px solid rgba(255,255,255,${cfg.border})`,
        boxShadow: glassBoxShadow(cfg),
      }}
    >
      {cfg.branch !== "frosted" && (
        // key on filterId remounts the <filter> when its contents change —
        // Chromium won't re-rasterize a backdrop-filter when only the feImage
        // normal-map href is edited in place; a fresh DOM node forces it.
        <svg key={filterId} aria-hidden width="0" height="0" style={{ position: "absolute" }}>
          <defs>
            <GlassFilterDef cfg={cfg} id={filterId} normalMap={normalMap} />
          </defs>
        </svg>
      )}
      {children}
    </div>
  );
}
