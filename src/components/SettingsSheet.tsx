"use client";

import { useEffect } from "react";
import { useBackground } from "@/components/BackgroundConfig";
import { useGlass } from "@/components/GlassConfig";
import { useMapStyle } from "@/components/MapStyleConfig";
import { BACKGROUND_STYLES } from "@/lib/background";
import {
  DEFAULT_GLASS,
  GLASS_BRANCHES,
  GLASS_SLIDERS,
  type GlassConfig,
} from "@/lib/glass";
import { MAP_STYLES } from "@/lib/map";
import { useIsMobile } from "@/lib/useIsMobile";
import AttributionLine from "@/components/AttributionLine";

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

/** The Onto customization surface — map style, background, and the live glass
 *  tuning — presented as a bottom sheet. Deliberately a solid dark panel (not
 *  glass) so it stays legible whatever the glass config is set to. Opened from
 *  the "Onto" item in the bottom-bar kebab. */
export default function SettingsSheet() {
  const { cfg, setCfg, open, setOpen } = useGlass();
  const { styleKey, setStyleKey } = useMapStyle();
  const { bgKey, setBgKey } = useBackground();
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  // Desktop uses the GlassControls panel instead — don't mount the sheet there.
  if (!open || !isMobile) return null;
  const set = (k: keyof GlassConfig) => (v: number) =>
    setCfg((c) => ({ ...c, [k]: v }));
  const sliders = GLASS_SLIDERS.filter(
    (s) => !s.branches || s.branches.includes(cfg.branch),
  );
  const activeStyle = MAP_STYLES.find((s) => s.key === styleKey);
  const activeBg = BACKGROUND_STYLES.find((b) => b.key === bgKey);

  const sectionLabel =
    "mb-1.5 block text-[10px] uppercase tracking-wide text-white/55";
  const chip = (active: boolean) =>
    `rounded-lg px-2 py-1.5 text-xs transition-colors ${
      active
        ? "bg-white text-black"
        : "bg-white/10 text-white/70 hover:bg-white/20"
    }`;

  return (
    <>
      {/* Scrim — tap to dismiss. */}
      <button
        type="button"
        aria-label="Close"
        onClick={() => setOpen(false)}
        className="fixed inset-0 z-40 cursor-default bg-black/40 backdrop-blur-[2px] duration-200 animate-in fade-in"
      />

      {/* Sheet — anchored to the bottom, constrained + centered on desktop. */}
      <div
        role="dialog"
        aria-label="Onto settings"
        className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[86dvh] w-full max-w-md flex-col rounded-t-[1.75rem] bg-[#11141b]/95 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur-md duration-300 animate-in slide-in-from-bottom-4"
      >
        {/* Drag handle. */}
        <div className="flex shrink-0 justify-center pt-2.5">
          <span className="h-1.5 w-10 rounded-full bg-white/25" />
        </div>

        <div className="flex items-center justify-between px-5 pb-3 pt-3">
          <span className="text-sm font-semibold tracking-tight text-white">
            Onto
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCfg(DEFAULT_GLASS)}
              className="rounded-full px-2 py-0.5 text-[11px] text-white/55 hover:bg-white/10 hover:text-white"
            >
              Reset glass
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="grid h-7 w-7 place-items-center rounded-full text-white/55 hover:bg-white/10 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {/* map style */}
          <div className="mb-4">
            <span className={sectionLabel}>Map style</span>
            <div className="grid grid-cols-3 gap-1.5">
              {MAP_STYLES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setStyleKey(s.key)}
                  className={chip(styleKey === s.key)}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {activeStyle && (
              <p className="mt-1.5 text-[10px] leading-snug text-white/40">
                {activeStyle.description}
              </p>
            )}
          </div>

          {/* background */}
          <div className="mb-4">
            <span className={sectionLabel}>Background</span>
            <div className="grid grid-cols-2 gap-1.5">
              {BACKGROUND_STYLES.map((b) => (
                <button
                  key={b.key}
                  type="button"
                  onClick={() => setBgKey(b.key)}
                  className={chip(bgKey === b.key)}
                >
                  {b.label}
                </button>
              ))}
            </div>
            {activeBg && (
              <p className="mt-1.5 text-[10px] leading-snug text-white/40">
                {activeBg.description}
              </p>
            )}
          </div>

          {/* glass branch */}
          <span className={sectionLabel}>Glass</span>
          <div className="mb-4 grid grid-cols-2 gap-1.5">
            {GLASS_BRANCHES.map((b) => (
              <button
                key={b.key}
                type="button"
                onClick={() => setCfg((c) => ({ ...c, branch: b.key }))}
                className={chip(cfg.branch === b.key)}
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
            Refraction (Edge lens / Chromatic) needs a Chromium browser and shows
            best over high-contrast map areas.
          </p>

          <AttributionLine className="mt-3 border-t border-white/10 pt-3" />
        </div>
      </div>
    </>
  );
}
