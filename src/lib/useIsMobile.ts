"use client";

import { useEffect, useState } from "react";

/** Matches Tailwind's `sm` breakpoint (640px). Used to gate the two mount-time
 *  panels (desktop glass controls vs. mobile settings sheet) and to pick the
 *  composer's placeholder copy — anything that can't be a pure CSS toggle.
 *  Structural show/hide stays in CSS (`hidden sm:*` / `sm:hidden`); this only
 *  covers cases where a prop or an early return has to branch. Defaults to
 *  desktop on the first render so SSR and hydration agree, then settles. */
export function useIsMobile(query = "(max-width: 639px)"): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setIsMobile(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return isMobile;
}
