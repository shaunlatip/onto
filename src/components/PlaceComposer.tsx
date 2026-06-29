"use client";

import GeocodeInput from "@/components/GeocodeInput";
import type { SpanColor } from "@/lib/colors";
import type { Place } from "@/lib/types";
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

/** Phosphor arrows-left-right — the swap affordance revealed on hover. */
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

  return (
    <div
      className={cn(
        "select-none text-center text-xl font-medium leading-snug tracking-tight text-foreground/70 sm:text-2xl",
      )}
    >
      See{" "}
      <GeocodeInput
        value={reference}
        color={referenceColor}
        onSelect={onReference}
        placeholder="somewhere you know"
        autoFocus={!compact}
      />
      {canSwap ? (
        <button
          type="button"
          onClick={onSwap}
          aria-label="Swap the two places"
          title="Swap"
          className="relative mx-[0.22em] inline-grid h-[1em] w-[1.5em] cursor-pointer place-items-center align-baseline text-foreground/55 outline-none transition-[color,transform] duration-150 hover:text-foreground focus-visible:text-foreground active:scale-90"
        >
          <span className="col-start-1 row-start-1 transition-opacity duration-200 group-hover:opacity-0">
            on
          </span>
          <span className="col-start-1 row-start-1 flex translate-y-[0.08em] items-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <SwapIcon />
          </span>
        </button>
      ) : (
        <span className="mx-[0.22em] text-foreground/55">on</span>
      )}
      <GeocodeInput
        value={target}
        color={targetColor}
        onSelect={onTarget}
        placeholder="somewhere new"
      />
    </div>
  );
}
