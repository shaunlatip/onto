import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Render once near the root. The shared displacement filter that gives the
 *  Tier-2 edge refraction (gentle: low frequency + low scale = the "30%" look). */
export function GlassFilter() {
  return (
    <svg
      aria-hidden
      width="0"
      height="0"
      className="pointer-events-none absolute"
      style={{ position: "absolute" }}
    >
      <defs>
        <filter
          id="span-glass-distortion"
          x="-15%"
          y="-15%"
          width="130%"
          height="130%"
          colorInterpolationFilters="sRGB"
        >
          {/* Low frequency = big smooth refraction waves (a lens), not fine
              frosted noise. */}
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.004 0.004"
            numOctaves={2}
            seed={11}
            result="noise"
          />
          <feGaussianBlur in="noise" stdDeviation="1.2" result="blurred" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="blurred"
            scale={34}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}

interface GlassProps {
  children: ReactNode;
  className?: string;
  /** Layer the refraction overlay. Off for tiny/edge cases. */
  refract?: boolean;
  /** Clip children to the rounded box. Off when a child (e.g. a dropdown)
   *  must overflow and float above other content. */
  clip?: boolean;
}

export function Glass({
  children,
  className,
  refract = true,
  clip = true,
}: GlassProps) {
  return (
    <div
      className={cn(
        "span-glass",
        refract && "is-refract",
        clip && "overflow-hidden",
        className,
      )}
    >
      {children}
    </div>
  );
}
