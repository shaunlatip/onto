"use client";

import { useEffect, useMemo, useState } from "react";
import { makeNormalMap } from "./normalMap";

/*
  Glass Lab — compare the major branching approaches to "liquid glass" on the
  web, and play with the primary parameters live.

  Branches (left → right = more "real glass", less "just frosted"):
   1. Frosted     — backdrop blur + tint + border + shadow. No displacement.
                    This is what Safari/Firefox + reduced-transparency users see.
   2. Turbulence  — Span today: feTurbulence → feDisplacementMap. A *uniform*
                    noise warp of the whole backdrop. Reads as wobble + blur.
   3. Edge lens   — displacement from an edge-concentrated normal map (flat
                    center, steep rim). Real refraction at the edge, like Apple.
   4. Chromatic   — edge lens + per-channel (R/B) offset → prismatic rim.
  Branches 2–4 use backdrop-filter: url() → Chromium only.
*/

type Branch = "frosted" | "turbulence" | "lens" | "chromatic";

interface Params {
  blur: number;
  tint: number;
  saturate: number;
  scale: number; // displacement strength (turbulence + lens)
  freq: number; // turbulence base frequency
  bevel: number; // lens rim width (px)
  chroma: number; // chromatic aberration (px)
  border: number; // rim opacity
  shadow: number; // elevation depth
  specular: number; // directional sheen
  radius: number;
}

const BRANCHES: { key: Branch; label: string; note: string }[] = [
  { key: "frosted", label: "1 · Frosted", note: "blur + tint + border. Cross-browser. The Safari/FF fallback." },
  { key: "turbulence", label: "2 · Turbulence", note: "Span today: uniform noise warp. Reads as wobble + blur. Chromium." },
  { key: "lens", label: "3 · Edge lens", note: "rim-concentrated displacement = real refraction. Chromium." },
  { key: "chromatic", label: "4 · Chromatic", note: "edge lens + prismatic R/B split at the rim. Chromium." },
];

// Per-branch archetype params for the comparison row (tuned to show each idea):
const PRESET: Record<Branch, Params> = {
  frosted: { blur: 12, tint: 0.5, saturate: 1.8, scale: 0, freq: 0.004, bevel: 18, chroma: 0, border: 0.7, shadow: 0.5, specular: 0.5, radius: 24 },
  turbulence: { blur: 5, tint: 0.34, saturate: 1.9, scale: 34, freq: 0.004, bevel: 18, chroma: 0, border: 0.7, shadow: 0.5, specular: 0.5, radius: 24 },
  lens: { blur: 2, tint: 0.22, saturate: 1.6, scale: 44, freq: 0.004, bevel: 20, chroma: 0, border: 0.85, shadow: 0.5, specular: 0.7, radius: 24 },
  chromatic: { blur: 1.5, tint: 0.2, saturate: 1.55, scale: 48, freq: 0.004, bevel: 20, chroma: 6, border: 0.9, shadow: 0.5, specular: 0.8, radius: 24 },
};

const BACKDROPS: { key: string; label: string; css: string }[] = [
  {
    key: "aurora",
    label: "Aurora",
    css: "radial-gradient(60% 80% at 20% 20%, #ff6ad5 0%, transparent 60%), radial-gradient(50% 70% at 80% 30%, #6a8cff 0%, transparent 55%), radial-gradient(70% 80% at 60% 90%, #43e0c0 0%, transparent 60%), linear-gradient(120deg, #1b1140, #07122e)",
  },
  {
    key: "citrus",
    label: "Citrus",
    css: "conic-gradient(from 30deg at 50% 50%, #ffd166, #ef476f, #06d6a0, #118ab2, #ffd166)",
  },
  {
    key: "grid",
    label: "Grid",
    css: "repeating-linear-gradient(0deg, rgba(11,16,32,0.9) 0 2px, transparent 2px 34px), repeating-linear-gradient(90deg, rgba(11,16,32,0.9) 0 2px, transparent 2px 34px), linear-gradient(135deg, #ffd166, #ef476f 40%, #06d6a0 70%, #118ab2)",
  },
];

function filterId(branch: Branch, suffix: string) {
  return `glasslab-${branch}-${suffix}`;
}

/** The backdrop-filter CSS for a given branch + params. */
function backdropFilter(branch: Branch, p: Params, idSuffix: string) {
  if (branch === "frosted") return `blur(${p.blur}px) saturate(${p.saturate})`;
  return `url(#${filterId(branch, idSuffix)}) blur(${p.blur}px) saturate(${p.saturate})`;
}

/** Emits the SVG <filter> for a displacement branch (turbulence/lens/chromatic). */
function FilterDef({
  branch,
  p,
  idSuffix,
  normalMap,
}: {
  branch: Branch;
  p: Params;
  idSuffix: string;
  normalMap: string;
}) {
  if (branch === "frosted") return null;
  const id = filterId(branch, idSuffix);

  if (branch === "turbulence") {
    return (
      <filter id={id} x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency={`${p.freq} ${p.freq}`} numOctaves={2} seed={11} result="noise" />
        <feGaussianBlur in="noise" stdDeviation={1} result="nb" />
        <feDisplacementMap in="SourceGraphic" in2="nb" scale={p.scale} xChannelSelector="R" yChannelSelector="G" />
      </filter>
    );
  }

  // lens + chromatic both use the edge normal map
  const img = (
    <feImage href={normalMap} preserveAspectRatio="none" x="0%" y="0%" width="100%" height="100%" result="nmap" />
  );
  if (branch === "lens") {
    return (
      <filter id={id} x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
        {img}
        <feDisplacementMap in="SourceGraphic" in2="nmap" scale={p.scale} xChannelSelector="R" yChannelSelector="G" />
      </filter>
    );
  }
  // chromatic: displace R/G/B at slightly different scales, recombine
  return (
    <filter id={id} x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
      {img}
      <feDisplacementMap in="SourceGraphic" in2="nmap" scale={p.scale + p.chroma} xChannelSelector="R" yChannelSelector="G" result="dR" />
      <feDisplacementMap in="SourceGraphic" in2="nmap" scale={p.scale} xChannelSelector="R" yChannelSelector="G" result="dG" />
      <feDisplacementMap in="SourceGraphic" in2="nmap" scale={p.scale - p.chroma} xChannelSelector="R" yChannelSelector="G" result="dB" />
      <feColorMatrix in="dR" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="rO" />
      <feColorMatrix in="dG" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="gO" />
      <feColorMatrix in="dB" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="bO" />
      <feComposite in="rO" in2="gO" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="rg" />
      <feComposite in="rg" in2="bO" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" />
    </filter>
  );
}

function GlassCard({
  branch,
  p,
  idSuffix,
  w,
  h,
  children,
}: {
  branch: Branch;
  p: Params;
  idSuffix: string;
  w: number;
  h: number;
  children?: React.ReactNode;
}) {
  const bf = backdropFilter(branch, p, idSuffix);
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: p.radius,
        position: "relative",
        isolation: "isolate",
        background: `rgba(255,255,255,${p.tint})`,
        WebkitBackdropFilter: bf,
        backdropFilter: bf,
        border: `1px solid rgba(255,255,255,${p.border})`,
        boxShadow: `0 ${26 * p.shadow}px ${70 * p.shadow}px -24px rgba(18,20,26,${0.5 * p.shadow}), inset 1.5px 1.5px 0 rgba(255,255,255,0.9), inset 0 0 16px rgba(255,255,255,0.4), inset 0 -2px 4px rgba(18,20,26,0.06)`,
        overflow: "hidden",
        display: "grid",
        placeItems: "center",
      }}
    >
      {/* directional specular sheen */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "inherit",
          pointerEvents: "none",
          opacity: p.specular,
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0) 30%), radial-gradient(120% 80% at 50% 120%, rgba(255,255,255,0.5), transparent 60%)",
          mixBlendMode: "screen",
        }}
      />
      {children}
    </div>
  );
}

const CMP_W = 270;
const CMP_H = 175;

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  fmt,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  fmt?: (v: number) => string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex justify-between text-[11px] uppercase tracking-wide text-white/55">
        <span>{label}</span>
        <span className="tabular-nums text-white/80">{fmt ? fmt(value) : value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/20 accent-white"
      />
    </label>
  );
}

export default function GlassLab() {
  const [backdrop, setBackdrop] = useState(BACKDROPS[0]);
  const [branch, setBranch] = useState<Branch>("lens");
  const [p, setP] = useState<Params>(PRESET.lens);
  const set = (k: keyof Params) => (v: number) => setP((prev) => ({ ...prev, [k]: v }));

  // Normal maps come from a <canvas> (client-only). Gate on mount so SSR and the
  // first client render agree (href=""), then compute via memo — no hydration
  // mismatch, no setState-in-effect cascade.
  const LIVE_W = 460;
  const LIVE_H = 300;
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot client mount gate
    setMounted(true);
  }, []);
  const cmpMap = useMemo(() => (mounted ? makeNormalMap(CMP_W, CMP_H, 24, 20) : ""), [mounted]);
  const liveMap = useMemo(
    () => (mounted ? makeNormalMap(LIVE_W, LIVE_H, p.radius, p.bevel) : ""),
    [mounted, p.radius, p.bevel],
  );

  const applyPreset = (b: Branch) => {
    setBranch(b);
    setP({ ...PRESET[b], radius: p.radius });
  };

  const showDisp = branch !== "frosted";

  const liveFilters = useMemo(
    () => (
      <>
        <FilterDef branch="turbulence" p={p} idSuffix="live" normalMap={liveMap} />
        <FilterDef branch="lens" p={p} idSuffix="live" normalMap={liveMap} />
        <FilterDef branch="chromatic" p={p} idSuffix="live" normalMap={liveMap} />
      </>
    ),
    [p, liveMap],
  );

  return (
    <main className="relative min-h-dvh w-full overflow-hidden text-white">
      {/* backdrop */}
      <div className="fixed inset-0 -z-10" style={{ background: backdrop.css, backgroundColor: "#0b1020" }} />
      {/* some real content under the glass so refraction has edges to bend */}
      <div className="pointer-events-none fixed inset-0 -z-10 grid grid-cols-6 opacity-90">
        {Array.from({ length: 48 }).map((_, i) => (
          <div key={i} className="flex items-center justify-center text-5xl font-black text-white/15">
            Aa
          </div>
        ))}
      </div>

      {/* All SVG filter defs live here */}
      <svg aria-hidden width="0" height="0" style={{ position: "absolute" }}>
        <defs>
          <FilterDef branch="turbulence" p={PRESET.turbulence} idSuffix="cmp" normalMap={cmpMap} />
          <FilterDef branch="lens" p={PRESET.lens} idSuffix="cmp" normalMap={cmpMap} />
          <FilterDef branch="chromatic" p={PRESET.chromatic} idSuffix="cmp" normalMap={cmpMap} />
          {liveFilters}
        </defs>
      </svg>

      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-8 inline-block rounded-2xl bg-black/35 px-5 py-4 backdrop-blur-md">
          <h1 className="text-2xl font-bold tracking-tight">Glass Lab</h1>
          <p className="mt-1 max-w-2xl text-sm text-white/75">
            How Span&apos;s &ldquo;liquid glass&rdquo; is actually built, and the major branches you could take. Today it&apos;s
            branch 2 (frosted blur + a uniform turbulence warp). Real liquid glass is branch 3–4: refraction concentrated at the
            rim, optionally with a prismatic split. Branches 2–4 need <code className="text-white/80">backdrop-filter: url()</code>{" "}
            (Chromium).
          </p>
          <div className="mt-3 flex gap-2">
            {BACKDROPS.map((b) => (
              <button
                key={b.key}
                onClick={() => setBackdrop(b)}
                className={`rounded-full px-3 py-1 text-xs ${backdrop.key === b.key ? "bg-white text-black" : "bg-white/10 text-white/70 hover:bg-white/20"}`}
              >
                {b.label}
              </button>
            ))}
          </div>
        </header>

        {/* Compare row: the four branches, same backdrop */}
        <section className="mb-12">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/50">Compare the branches</h2>
          <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
            {BRANCHES.map((b) => (
              <div key={b.key} className="flex flex-col gap-2">
                <GlassCard branch={b.key} p={PRESET[b.key]} idSuffix="cmp" w={CMP_W} h={CMP_H}>
                  <span className="text-sm font-medium text-black/70 mix-blend-hard-light">{b.label}</span>
                </GlassCard>
                <p className="text-[11px] leading-snug text-white/55">{b.note}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Live tuner */}
        <section className="grid gap-8 lg:grid-cols-[460px_1fr]">
          <div className="flex flex-col items-start gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-white/50">Live · {branch}</h2>
            <GlassCard branch={branch} p={p} idSuffix="live" w={LIVE_W} h={LIVE_H}>
              <div className="text-center">
                <div className="text-lg font-semibold text-black/70 mix-blend-hard-light">Drag the sliders →</div>
                <div className="text-xs text-black/50 mix-blend-hard-light">refraction shows best over the colorful backdrops</div>
              </div>
            </GlassCard>
            <div className="flex flex-wrap gap-2">
              {BRANCHES.map((b) => (
                <button
                  key={b.key}
                  onClick={() => applyPreset(b.key)}
                  className={`rounded-full px-3 py-1 text-xs ${branch === b.key ? "bg-white text-black" : "bg-white/10 text-white/70 hover:bg-white/20"}`}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-4 self-start rounded-2xl bg-black/25 p-5 backdrop-blur-sm">
            <Slider label="Blur" value={p.blur} min={0} max={30} step={0.5} onChange={set("blur")} fmt={(v) => `${v}px`} />
            <Slider label="Tint opacity" value={p.tint} min={0} max={1} step={0.01} onChange={set("tint")} fmt={(v) => v.toFixed(2)} />
            <Slider label="Saturate" value={p.saturate} min={1} max={2.6} step={0.05} onChange={set("saturate")} fmt={(v) => `${v.toFixed(2)}×`} />
            <Slider label="Radius" value={p.radius} min={0} max={80} step={1} onChange={set("radius")} fmt={(v) => `${v}px`} />
            <Slider label="Border" value={p.border} min={0} max={1} step={0.01} onChange={set("border")} fmt={(v) => v.toFixed(2)} />
            <Slider label="Shadow" value={p.shadow} min={0} max={1.5} step={0.05} onChange={set("shadow")} fmt={(v) => v.toFixed(2)} />
            <Slider label="Specular" value={p.specular} min={0} max={1} step={0.01} onChange={set("specular")} fmt={(v) => v.toFixed(2)} />
            <div className="col-span-2 my-1 h-px bg-white/10" />
            {showDisp && (
              <Slider label="Displace scale" value={p.scale} min={0} max={90} step={1} onChange={set("scale")} fmt={(v) => `${v}`} />
            )}
            {branch === "turbulence" && (
              <Slider label="Turb. frequency" value={p.freq} min={0.001} max={0.03} step={0.001} onChange={set("freq")} fmt={(v) => v.toFixed(3)} />
            )}
            {(branch === "lens" || branch === "chromatic") && (
              <Slider label="Rim bevel" value={p.bevel} min={4} max={80} step={1} onChange={set("bevel")} fmt={(v) => `${v}px`} />
            )}
            {branch === "chromatic" && (
              <Slider label="Chromatic" value={p.chroma} min={0} max={20} step={0.5} onChange={set("chroma")} fmt={(v) => `${v}px`} />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
