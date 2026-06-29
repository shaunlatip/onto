"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/** Gentle change animation: when `text` changes the new value blur-fades in,
 *  masking the swap (Emil: blur bridges two states into one). Calmer than a
 *  character scramble, and inline-safe (opacity + filter only — no transform —
 *  so multi-word names still wrap). Keyed remount replays the CSS animation. */
export default function MorphText({
  text,
  className,
  style,
}: {
  text: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span key={text} className={cn("span-morph", className)} style={style}>
      {text}
    </span>
  );
}
