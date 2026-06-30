"use client";

import { useGlass } from "@/components/GlassConfig";
import {
  DEFAULT_GLASS,
  GLASS_BRANCHES,
  GLASS_SLIDERS,
  type GlassConfig,
} from "@/lib/glass";

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
      <span className="flex justify-between text-[10px] uppercase tracking-wide text-white/55">
        <span>{label}</span>
        <span className="tabular-nums text-white/85">{fmt ? fmt(value) : value}</span>
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

/** Floating control panel that opens from the "Span" wordmark and tweaks the
 *  app's glass live. Deliberately a solid dark panel (not glass) so it stays
 *  legible whatever the glass config is set to. */
export default function GlassControls() {
  const { cfg, setCfg, open, setOpen } = useGlass();
  if (!open) return null;
  const set = (k: keyof GlassConfig) => (v: number) =>
    setCfg((c) => ({ ...c, [k]: v }));
  const sliders = GLASS_SLIDERS.filter(
    (s) => !s.branches || s.branches.includes(cfg.branch),
  );

  return (
    <div className="absolute left-6 top-[4.25rem] z-40 w-[19rem] max-w-[calc(100vw-3rem)] rounded-2xl bg-[#11141b]/92 p-4 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur-md duration-200 animate-in fade-in slide-in-from-top-2">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-white/60">
          Glass
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCfg(DEFAULT_GLASS)}
            className="rounded-full px-2 py-0.5 text-[11px] text-white/55 hover:bg-white/10 hover:text-white"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close glass controls"
            className="grid h-6 w-6 place-items-center rounded-full text-white/55 hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>
      </div>

      {/* branch selector */}
      <div className="mb-4 grid grid-cols-2 gap-1.5">
        {GLASS_BRANCHES.map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => setCfg((c) => ({ ...c, branch: b.key }))}
            className={`rounded-lg px-2 py-1.5 text-xs transition-colors ${
              cfg.branch === b.key
                ? "bg-white text-black"
                : "bg-white/10 text-white/70 hover:bg-white/20"
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {sliders.map((s) => (
          <Slider
            key={s.key}
            label={s.label}
            value={cfg[s.key] as number}
            min={s.min}
            max={s.max}
            step={s.step}
            onChange={set(s.key)}
            fmt={s.fmt}
          />
        ))}
      </div>

      <p className="mt-3 text-[10px] leading-snug text-white/40">
        Refraction (Edge lens / Chromatic) needs a Chromium browser and shows best
        over high-contrast map areas.
      </p>
    </div>
  );
}
