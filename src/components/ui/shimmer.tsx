"use client";

import {
  useLayoutEffect,
  useRef,
  type ElementType,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

interface ShimmerGroupProps {
  /** While true, every `[data-shimmer]` descendant shimmers. */
  active: boolean;
  children: ReactNode;
  as?: ElementType;
  className?: string;
}

/** Text shimmer for in-progress states, after AI Elements' Shimmer
 *  (elements.ai-sdk.dev/components/shimmer): a background-colored highlight
 *  sweeps across muted text. Where that component shimmers one string, this
 *  runs ONE sweep across every `[data-shimmer]` string inside the group, so a
 *  whole list reads as a single loading surface rather than separate strings.
 *
 *  Each string's gradient is sized to the whole group and offset by the
 *  string's position in it (measured on activation), so all of them show
 *  slices of the same band. Styles live in globals.css (`[data-shimmering]`). */
export function ShimmerGroup({
  active,
  children,
  as: Component = "div",
  className,
}: ShimmerGroupProps) {
  const ref = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!active || !root) return;
    const box = root.getBoundingClientRect();
    root.style.setProperty("--shimmer-w", `${box.width}px`);
    root.style.setProperty("--shimmer-h", `${box.height}px`);
    root.querySelectorAll<HTMLElement>("[data-shimmer]").forEach((el) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--shimmer-ox", `${r.left - box.left}px`);
      el.style.setProperty("--shimmer-oy", `${r.top - box.top}px`);
    });
  }, [active]);

  return (
    <Component
      ref={ref}
      data-shimmering={active || undefined}
      className={cn(className)}
    >
      {children}
    </Component>
  );
}
