"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import { Glass } from "@/components/Glass";
import { ReadoutContent } from "@/components/Readout";
import { useGlass } from "@/components/GlassConfig";
import type { SpanColor } from "@/lib/colors";
import type { Readout as ReadoutData } from "@/lib/geo";
import { cn } from "@/lib/utils";

/** Phosphor (regular) icons — one family, so the menu reads as a set. */
const ICON = {
  zoomIn:
    "M152,112a8,8,0,0,1-8,8H120v24a8,8,0,0,1-16,0V120H80a8,8,0,0,1,0-16h24V80a8,8,0,0,1,16,0v24h24A8,8,0,0,1,152,112Zm77.66,117.66a8,8,0,0,1-11.32,0l-50.06-50.07a88.11,88.11,0,1,1,11.31-11.31l50.07,50.06A8,8,0,0,1,229.66,229.66ZM112,184a72,72,0,1,0-72-72A72.08,72.08,0,0,0,112,184Z",
  zoomOut:
    "M152,112a8,8,0,0,1-8,8H80a8,8,0,0,1,0-16h64A8,8,0,0,1,152,112Zm77.66,117.66a8,8,0,0,1-11.32,0l-50.06-50.07a88.11,88.11,0,1,1,11.31-11.31l50.07,50.06A8,8,0,0,1,229.66,229.66ZM112,184a72,72,0,1,0-72-72A72.08,72.08,0,0,0,112,184Z",
  fullscreen:
    "M216,48V96a8,8,0,0,1-16,0V67.31l-50.34,50.35a8,8,0,0,1-11.32-11.32L188.69,56H160a8,8,0,0,1,0-16h48A8,8,0,0,1,216,48ZM106.34,138.34,56,188.69V160a8,8,0,0,0-16,0v48a8,8,0,0,0,8,8H96a8,8,0,0,0,0-16H67.31l50.35-50.34a8,8,0,0,0-11.32-11.32ZM200,152a8,8,0,0,0-8,8v28.69l-50.34-50.35a8,8,0,0,0-11.32,11.32L180.69,200H152a8,8,0,0,0,0,16h48a8,8,0,0,0,8-8V160A8,8,0,0,0,200,152ZM67.31,56H96a8,8,0,0,0,0-16H48a8,8,0,0,0-8,8V96a8,8,0,0,0,16,0V67.31l50.34,50.35a8,8,0,0,0,11.32-11.32Z",
  fullscreenExit:
    "M144,104V64a8,8,0,0,1,16,0V84.69l42.34-42.35a8,8,0,0,1,11.32,11.32L171.31,96H192a8,8,0,0,1,0,16H152A8,8,0,0,1,144,104Zm-40,40H64a8,8,0,0,0,0,16H84.69L42.34,202.34a8,8,0,0,0,11.32,11.32L96,171.31V192a8,8,0,0,0,16,0V152A8,8,0,0,0,104,144Zm67.31,16H192a8,8,0,0,0,0-16H152a8,8,0,0,0-8,8v40a8,8,0,0,0,16,0V171.31l42.34,42.35a8,8,0,0,0,11.32-11.32ZM104,56a8,8,0,0,0-8,8V84.69L53.66,42.34A8,8,0,0,0,42.34,53.66L84.69,96H64a8,8,0,0,0,0,16h40a8,8,0,0,0,8-8V64A8,8,0,0,0,104,56Z",
  map: "M228.92,49.69a8,8,0,0,0-6.86-1.45L160.93,63.52,99.58,32.84a8,8,0,0,0-5.52-.6l-64,16A8,8,0,0,0,24,56V200a8,8,0,0,0,9.94,7.76l61.13-15.28,61.35,30.68A8.15,8.15,0,0,0,160,224a8,8,0,0,0,1.94-.24l64-16A8,8,0,0,0,232,200V56A8,8,0,0,0,228.92,49.69ZM104,52.94l48,24V203.06l-48-24ZM40,62.25l48-12v127.5l-48,12Zm176,131.5-48,12V78.25l48-12Z",
  globe:
    "M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm88,104a87.62,87.62,0,0,1-6.4,32.94l-44.7-27.49a15.92,15.92,0,0,0-6.24-2.23l-22.82-3.08a16.11,16.11,0,0,0-16,7.86h-8.72l-3.8-7.86a15.91,15.91,0,0,0-11-8.67l-8-1.73L96.14,104h16.71a16.06,16.06,0,0,0,7.73-2l12.25-6.76a16.62,16.62,0,0,0,3-2.14l26.91-24.34A15.93,15.93,0,0,0,166,49.1l-.36-.65A88.11,88.11,0,0,1,216,128ZM143.31,41.34,152,56.9,125.09,81.24,112.85,88H96.14a16,16,0,0,0-13.88,8l-8.73,15.23L63.38,84.19,74.32,58.32a87.87,87.87,0,0,1,69-17ZM40,128a87.53,87.53,0,0,1,8.54-37.8l11.34,30.27a16,16,0,0,0,11.62,10l21.43,4.61L96.74,143a16.09,16.09,0,0,0,14.4,9h1.48l-7.23,16.23a16,16,0,0,0,2.86,17.37l.14.14L128,205.94l-1.94,10A88.11,88.11,0,0,1,40,128Zm102.58,86.78,1.13-5.81a16.09,16.09,0,0,0-4-13.9,1.85,1.85,0,0,1-.14-.14L120,174.74,133.7,144l22.82,3.08,45.72,28.12A88.18,88.18,0,0,1,142.58,214.78Z",
  reset:
    "M224,128a96,96,0,0,1-94.71,96H128A95.38,95.38,0,0,1,62.1,197.8a8,8,0,0,1,11-11.63A80,80,0,1,0,71.43,71.39a3.07,3.07,0,0,1-.26.25L44.59,96H72a8,8,0,0,1,0,16H24a8,8,0,0,1-8-8V56a8,8,0,0,1,16,0V85.8L60.25,60A96,96,0,0,1,224,128Z",
  kebab:
    "M140,128a12,12,0,1,1-12-12A12,12,0,0,1,140,128Zm-12-52a12,12,0,1,0-12-12A12,12,0,0,0,128,76Zm0,104a12,12,0,1,0,12,12A12,12,0,0,0,128,180Z",
  // sliders-horizontal — the "Onto" customization entry
  onto: "M40,88H73a32,32,0,0,0,62,0h81a8,8,0,0,0,0-16H135a32,32,0,0,0-62,0H40a8,8,0,0,0,0,16Zm64-24A16,16,0,1,1,88,80,16,16,0,0,1,104,64ZM216,168H199a32,32,0,0,0-62,0H40a8,8,0,0,0,0,16h97a32,32,0,0,0,62,0h17a8,8,0,0,0,0-16Zm-48,24a16,16,0,1,1,16-16A16,16,0,0,1,168,192Z",
} as const;

function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" fill="currentColor" aria-hidden>
      <path d={d} />
    </svg>
  );
}

interface BottomBarProps {
  mapRef: RefObject<MapRef | null>;
  projection: "globe" | "mercator";
  onToggleProjection: () => void;
  onReset: () => void;
  canReset: boolean;
  readout: ReadoutData | null;
  referenceColor: SpanColor;
  targetColor: SpanColor;
}

/** Mobile-only. One glass pill at the bottom-center that fuses the comparison
 *  readout with the controls kebab. Cold state: just the kebab. Filled: readout
 *  + kebab, so the two never read as separate stacked chunks. Desktop keeps the
 *  original centered readout card + bottom-right MapControls instead. */
export default function BottomBar({
  mapRef,
  projection,
  onToggleProjection,
  onReset,
  canReset,
  readout,
  referenceColor,
  targetColor,
}: BottomBarProps) {
  const { setOpen } = useGlass();
  const [isFull, setIsFull] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onChange = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent | TouchEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const isGlobe = projection === "globe";

  const zoomBy = (delta: number) => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    map.easeTo({ zoom: map.getZoom() + delta, duration: 220 });
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  };

  const row =
    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-foreground/75 outline-none transition-colors duration-150 hover:bg-foreground/[0.06] hover:text-foreground focus-visible:bg-foreground/[0.06] active:bg-foreground/[0.1]";

  return (
    <div
      ref={menuRef}
      className={cn(
        // bottom-4 mirrors the composer chip's top-4 inset. Cold state tucks the
        // lone kebab into the bottom-right corner; with stats it centers and
        // grows into the pill.
        "pointer-events-auto absolute z-30 sm:hidden",
        readout
          ? "bottom-4 left-1/2 max-w-[calc(100vw-2rem)] -translate-x-1/2"
          : "bottom-4 right-4",
      )}
    >
      {menuOpen && (
        <div className="absolute bottom-full right-0 mb-2.5 duration-150 animate-in fade-in slide-in-from-bottom-1">
          <Glass className="flex min-w-[11rem] flex-col rounded-2xl divide-y divide-foreground/[0.08]">
            <button
              type="button"
              onClick={() => {
                setOpen(true);
                setMenuOpen(false);
              }}
              className={cn(row, "rounded-t-2xl")}
            >
              <Icon d={ICON.onto} size={17} />
              Onto
            </button>
            <button
              type="button"
              onClick={() => {
                onToggleProjection();
                setMenuOpen(false);
              }}
              className={row}
            >
              <Icon d={isGlobe ? ICON.map : ICON.globe} size={17} />
              {isGlobe ? "Flat map" : "Globe"}
            </button>
            <button type="button" onClick={() => zoomBy(1)} className={row}>
              <Icon d={ICON.zoomIn} size={17} />
              Zoom in
            </button>
            <button type="button" onClick={() => zoomBy(-1)} className={row}>
              <Icon d={ICON.zoomOut} size={17} />
              Zoom out
            </button>
            <button
              type="button"
              onClick={() => {
                toggleFullscreen();
                setMenuOpen(false);
              }}
              className={cn(row, !canReset && "rounded-b-2xl")}
            >
              <Icon d={isFull ? ICON.fullscreenExit : ICON.fullscreen} size={17} />
              {isFull ? "Exit fullscreen" : "Fullscreen"}
            </button>
            {canReset && (
              <button
                type="button"
                onClick={() => {
                  onReset();
                  setMenuOpen(false);
                }}
                className={cn(row, "rounded-b-2xl")}
              >
                <Icon d={ICON.reset} size={17} />
                Reset
              </button>
            )}
          </Glass>
        </div>
      )}

      <Glass
        clip={false}
        className={cn(
          "span-elastic group flex items-center rounded-2xl",
          readout ? "gap-2 py-2 pl-4 pr-2" : "p-0",
        )}
        refract={false}
      >
        {readout && (
          <div className="min-w-0 text-left">
            <ReadoutContent
              data={readout}
              referenceColor={referenceColor}
              targetColor={targetColor}
              variant="bar"
            />
          </div>
        )}
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Menu"
          aria-expanded={menuOpen}
          title="Menu"
          className={cn(
            "grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-xl text-foreground/70 outline-none transition-colors duration-150 hover:bg-foreground/[0.06] hover:text-foreground focus-visible:bg-foreground/[0.06] active:bg-foreground/[0.1]",
            !readout && "h-10 w-10 rounded-2xl",
            menuOpen && "bg-foreground/[0.08] text-foreground",
          )}
        >
          <Icon d={ICON.kebab} size={19} />
        </button>
      </Glass>
    </div>
  );
}
