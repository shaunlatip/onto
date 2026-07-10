"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { BackgroundProvider, useBackground } from "@/components/BackgroundConfig";
import { Glass } from "@/components/Glass";
import { GlassConfigProvider, useGlass } from "@/components/GlassConfig";
import GlassControls from "@/components/GlassControls";
import { MapStyleProvider, useMapStyle } from "@/components/MapStyleConfig";
import PlaceComposer from "@/components/PlaceComposer";
import Readout from "@/components/Readout";
import SpaceField from "@/components/SpaceField";
import { backgroundClassName } from "@/lib/background";
import { ColorAssigner, PALETTE, type SpanColor } from "@/lib/colors";
import { mapStyleUrl } from "@/lib/map";
import {
  featureBounds,
  placeOverlay,
  readout,
  unionBounds,
  type Bounds,
} from "@/lib/geo";
import type { Place } from "@/lib/types";
import { cn } from "@/lib/utils";

const SpanMap = dynamic(() => import("@/components/SpanMap"), { ssr: false });

/** Phosphor caret-down — reveals to the right of the wordmark on hover / open,
 *  rotates 180° to mean "open" (see the Onto menu toggle below). */
function CaretIcon({ className }: { className?: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 256 256"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z" />
    </svg>
  );
}

export default function Home() {
  return (
    <GlassConfigProvider>
      <MapStyleProvider>
        <BackgroundProvider>
          <HomeInner />
        </BackgroundProvider>
      </MapStyleProvider>
    </GlassConfigProvider>
  );
}

function HomeInner() {
  const { open, setOpen } = useGlass();
  const { styleKey } = useMapStyle();
  const { bgKey } = useBackground();
  const [wordmarkHovered, setWordmarkHovered] = useState(false);
  const [assigner] = useState(() => new ColorAssigner());

  const [reference, setReference] = useState<Place | null>(null);
  const [target, setTarget] = useState<Place | null>(null);
  const [referenceColor, setReferenceColor] = useState<SpanColor>(PALETTE[0]);
  const [targetColor, setTargetColor] = useState<SpanColor>(PALETTE[1]);
  const [placement, setPlacement] = useState<[number, number] | null>(null);
  const [projection, setProjection] = useState<"globe" | "mercator">("globe");
  const [resetKey, setResetKey] = useState(0);

  function reset() {
    setReference(null);
    setTarget(null);
    setPlacement(null);
    setProjection("globe");
    setResetKey((k) => k + 1);
  }

  // Any new selection re-centers the familiar place (X) onto the new place (Y),
  // and assigns/keeps that place's session color.
  function selectReference(p: Place) {
    setReference(p);
    setReferenceColor(assigner.colorFor(p.id));
    setPlacement((target ?? p).center);
  }
  function selectTarget(p: Place) {
    setTarget(p);
    setTargetColor(assigner.colorFor(p.id));
    setPlacement(p.center);
  }
  function swap() {
    if (!reference || !target) return;
    setReference(target);
    setTarget(reference);
    setReferenceColor(assigner.colorFor(target.id));
    setTargetColor(assigner.colorFor(reference.id));
    setPlacement(reference.center);
  }

  const mercator = projection === "mercator";
  const referenceFeature = useMemo(
    () =>
      reference && placement
        ? placeOverlay(reference, placement, mercator)
        : null,
    [reference, placement, mercator],
  );
  const targetFeature = target?.feature ?? null;

  const fitKey = `${reference?.id ?? ""}|${target?.id ?? ""}`;
  const fitBounds = useMemo<Bounds | null>(() => {
    if (reference && target)
      return unionBounds(target, reference, target.center, mercator);
    if (target) return featureBounds(target.feature);
    if (reference) return featureBounds(reference.feature);
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  const r = reference && target ? readout(reference, target) : null;
  const both = !!reference && !!target;

  return (
    <main
      className={`relative h-dvh w-full overflow-hidden ${backgroundClassName(bgKey)}`}
    >
      {bgKey === "space" && <SpaceField />}
      <SpanMap
        mapStyleUrl={mapStyleUrl(styleKey)}
        targetFeature={targetFeature}
        targetColor={targetColor}
        referenceFeature={referenceFeature}
        referenceColor={referenceColor}
        referencePlace={reference}
        placement={placement}
        onDrag={setPlacement}
        fitBounds={fitBounds}
        fitKey={fitKey}
        projection={projection}
        onToggleProjection={() =>
          setProjection((p) => (p === "globe" ? "mercator" : "globe"))
        }
        resetKey={resetKey}
      />

      {/* Wordmark — click to open the live glass controls. On hover or while
          open, the chip grows to reveal a caret that flips to mark state. The
          caret stays mounted and its wrapper's grid-template-columns is what
          animates 0 → icon width, so both the reveal AND the collapse (not
          just the reveal) get a proper transition. */}
      <div className="absolute left-6 top-5 z-40 select-none">
        <Glass className="rounded-xl">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            onMouseEnter={() => setWordmarkHovered(true)}
            onMouseLeave={() => setWordmarkHovered(false)}
            onFocus={() => setWordmarkHovered(true)}
            onBlur={() => setWordmarkHovered(false)}
            title="Glass controls"
            aria-label={open ? "Close glass controls" : "Open glass controls"}
            aria-expanded={open}
            className="flex cursor-pointer items-center whitespace-nowrap px-3.5 py-1.5 text-lg font-bold tracking-tight text-foreground/85 outline-none"
          >
            Onto
            <span
              className={cn(
                "grid overflow-hidden transition-[grid-template-columns,margin-left] duration-200 ease-out-soft",
                wordmarkHovered || open
                  ? "ml-1.5 grid-cols-[12px]"
                  : "ml-0 grid-cols-[0px]",
              )}
            >
              <CaretIcon
                className={cn(
                  "min-w-[12px] transition-[transform,opacity] duration-200 ease-out-soft",
                  wordmarkHovered || open ? "opacity-100" : "opacity-0",
                  open && "rotate-180",
                )}
              />
            </span>
          </button>
        </Glass>
      </div>
      <GlassControls />

      {/* Reset — only with a full comparison; clears back to the cold globe. */}
      {both && (
        <div className="absolute right-6 top-5 z-30 duration-300 animate-in fade-in">
          <Glass className="rounded-xl" refract={false}>
            <button
              type="button"
              onClick={reset}
              aria-label="Reset"
              title="Reset"
              className="grid h-9 w-9 cursor-pointer place-items-center text-foreground/70 outline-none transition-colors duration-150 hover:bg-foreground/[0.06] hover:text-foreground active:scale-95"
            >
              <svg width="19" height="19" viewBox="0 0 256 256" fill="currentColor" aria-hidden>
                <path d="M224,128a96,96,0,0,1-94.71,96H128A95.38,95.38,0,0,1,62.1,197.8a8,8,0,0,1,11-11.63A80,80,0,1,0,71.43,71.39a3.07,3.07,0,0,1-.26.25L44.59,96H72a8,8,0,0,1,0,16H24a8,8,0,0,1-8-8V56a8,8,0,0,1,16,0V85.8L60.25,60A96,96,0,0,1,224,128Z" />
              </svg>
            </button>
          </Glass>
        </div>
      )}

      {/* Composer: top-center, fixed position + size across cold/filled. */}
      <div className="absolute left-1/2 top-4 z-30 max-w-[calc(100vw-2rem)] -translate-x-1/2">
        <Glass
          clip={false}
          className="span-elastic group rounded-[1.75rem] px-6 py-3.5"
        >
          <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-foreground/[0.04] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          {/* Focus/active state — a light inset ring while a field inside is
              being edited. Lives on its own layer (not Glass's own border/
              shadow, which are set inline per the glass config) so it composes
              cleanly with whatever glass look is active. */}
          <div className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.6)] transition-opacity duration-200 ease-out-soft group-focus-within:opacity-100" />
          <PlaceComposer
            reference={reference}
            target={target}
            referenceColor={reference ? referenceColor : null}
            targetColor={target ? targetColor : null}
            onReference={selectReference}
            onTarget={selectTarget}
            onSwap={swap}
            compact={both}
          />
        </Glass>
      </div>

      {/* Readout */}
      {r && (
        <div className="pointer-events-none absolute bottom-7 left-1/2 z-20 -translate-x-1/2 px-4 duration-500 animate-in fade-in slide-in-from-bottom-3">
          <Readout
            data={r}
            referenceColor={referenceColor}
            targetColor={targetColor}
          />
        </div>
      )}
    </main>
  );
}
