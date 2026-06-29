"use client";

import { useEffect, useState, type RefObject } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import { Glass } from "@/components/Glass";
import { cn } from "@/lib/utils";

/** Phosphor (regular) icons — one family, so the controls read as a set. */
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
} as const;

function Icon({ d }: { d: string }) {
  return (
    <svg width="19" height="19" viewBox="0 0 256 256" fill="currentColor" aria-hidden>
      <path d={d} />
    </svg>
  );
}

interface MapControlsProps {
  mapRef: RefObject<MapRef | null>;
  projection: "globe" | "mercator";
  onToggleProjection: () => void;
}

export default function MapControls({
  mapRef,
  projection,
  onToggleProjection,
}: MapControlsProps) {
  const [isFull, setIsFull] = useState(false);
  useEffect(() => {
    const onChange = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const zoomBy = (delta: number) => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    map.easeTo({ zoom: map.getZoom() + delta, duration: 220 });
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  };

  const btn =
    "grid h-9 w-9 cursor-pointer place-items-center text-foreground/70 outline-none transition-colors duration-150 hover:bg-foreground/[0.06] hover:text-foreground focus-visible:bg-foreground/[0.06] active:bg-foreground/[0.1]";

  return (
    <div className="pointer-events-auto absolute bottom-6 right-6 z-30 flex flex-col gap-2.5">
      <Glass className="flex flex-col rounded-xl divide-y divide-foreground/[0.08]">
        <button
          type="button"
          onClick={onToggleProjection}
          aria-label={projection === "globe" ? "Flat map" : "Globe"}
          title={projection === "globe" ? "Flat map" : "Globe"}
          className={cn(btn, "rounded-t-xl")}
        >
          <Icon d={projection === "globe" ? ICON.map : ICON.globe} />
        </button>
      </Glass>

      <Glass className="flex flex-col rounded-xl divide-y divide-foreground/[0.08]">
        <button
          type="button"
          onClick={() => zoomBy(1)}
          aria-label="Zoom in"
          title="Zoom in"
          className={cn(btn, "rounded-t-xl")}
        >
          <Icon d={ICON.zoomIn} />
        </button>
        <button
          type="button"
          onClick={() => zoomBy(-1)}
          aria-label="Zoom out"
          title="Zoom out"
          className={cn(btn, "rounded-b-xl")}
        >
          <Icon d={ICON.zoomOut} />
        </button>
      </Glass>

      <Glass className="flex flex-col rounded-xl">
        <button
          type="button"
          onClick={toggleFullscreen}
          aria-label={isFull ? "Exit fullscreen" : "Fullscreen"}
          title={isFull ? "Exit fullscreen" : "Fullscreen"}
          className={cn(btn, "rounded-xl")}
        >
          <Icon d={isFull ? ICON.fullscreenExit : ICON.fullscreen} />
        </button>
      </Glass>
    </div>
  );
}
