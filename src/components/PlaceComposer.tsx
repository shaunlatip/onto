"use client";

import GeocodeInput from "@/components/GeocodeInput";
import type { SpanColor } from "@/lib/colors";
import type { Place } from "@/lib/types";
import { useIsMobile } from "@/lib/useIsMobile";
import { cn } from "@/lib/utils";

interface PlaceComposerProps {
  reference: Place | null;
  target: Place | null;
  referenceColor: SpanColor | null;
  targetColor: SpanColor | null;
  onReference: (p: Place) => void;
  onTarget: (p: Place) => void;
  onSwap: () => void;
  /** Compact pill (both chosen) vs larger getting-started state. */
  compact: boolean;
}

/** Phosphor arrows-left-right — the swap affordance (hover on desktop, always
 *  shown on touch). */
function SwapIcon() {
  return (
    <svg width="1em" height="1em" viewBox="0 0 256 256" fill="currentColor" aria-hidden>
      <path d="M213.66,181.66l-32,32a8,8,0,0,1-11.32-11.32L188.69,184H48a8,8,0,0,1,0-16H188.69l-18.35-18.34a8,8,0,0,1,11.32-11.32l32,32A8,8,0,0,1,213.66,181.66Zm-139.32-64a8,8,0,0,0,11.32-11.32L67.31,88H208a8,8,0,0,0,0-16H67.31L85.66,53.66A8,8,0,0,0,74.34,42.34l-32,32a8,8,0,0,0,0,11.32Z" />
    </svg>
  );
}

export default function PlaceComposer({
  reference,
  target,
  referenceColor,
  targetColor,
  onReference,
  onTarget,
  onSwap,
  compact,
}: PlaceComposerProps) {
  const canSwap = !!reference && !!target;
  // Mobile shortens the familiar-place prompt so the cold sentence stays on one
  // line; desktop keeps the fuller copy (it has the room).
  const isMobile = useIsMobile();

  // All the non-place words ("See", "the", "on") share the one ink set here;
  // the places carry their own session colors.
  return (
    <div
      className={cn(
        "select-none text-center text-lg font-medium leading-snug tracking-tight text-foreground/70 sm:text-2xl",
      )}
    >
      See{" "}
      <GeocodeInput
        value={reference}
        color={referenceColor}
        onSelect={onReference}
        placeholder={isMobile ? "somewhere" : "somewhere you know"}
        autoFocus={!compact}
      />{" "}
      {canSwap ? (
        // "on" stays a plain word between ordinary spaces, so its gaps match
        // every other word gap; the icon overlays it without taking width, and
        // the ::before pad gives the small word a comfortable hit area.
        <button
          type="button"
          onClick={onSwap}
          aria-label="Swap the two places"
          title="Swap"
          className="relative cursor-pointer outline-none transition-[color,transform] duration-150 before:absolute before:-inset-x-1.5 before:-inset-y-1 hover:text-foreground focus-visible:text-foreground active:scale-90"
        >
          {/* Hover reveals the swap icon in place of "on". Touch has no hover,
              so there the icon shows whenever a swap is possible. */}
          <span className="transition-opacity duration-200 group-hover:opacity-0 [@media(hover:none)]:opacity-0">
            on
          </span>
          <span className="absolute inset-0 flex translate-y-[0.08em] items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
            <SwapIcon />
          </span>
        </button>
      ) : (
        "on"
      )}{" "}
      <GeocodeInput
        value={target}
        color={targetColor}
        onSelect={onTarget}
        placeholder="somewhere new"
      />
    </div>
  );
}
