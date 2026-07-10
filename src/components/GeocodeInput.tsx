"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { Glass } from "@/components/Glass";
import MorphText from "@/components/MorphText";
import type { SpanColor } from "@/lib/colors";
import { buildPlace } from "@/lib/geo";
import { geocode, type GeocodeResult } from "@/lib/nominatim";
import type { Place } from "@/lib/types";
import { cn } from "@/lib/utils";

interface GeocodeInputProps {
  value: Place | null;
  /** Session color once selected; null while empty (neutral typing). */
  color: SpanColor | null;
  onSelect: (place: Place) => void;
  placeholder: string;
  autoFocus?: boolean;
}

export default function GeocodeInput({
  value,
  color,
  onSelect,
  placeholder,
  autoFocus,
}: GeocodeInputProps) {
  const listId = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const [editing, setEditing] = useState(!value);
  const [query, setQuery] = useState("");
  // Only search/open once the user actually edits — a pre-filled value stays quiet.
  const [touched, setTouched] = useState(false);
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const open = editing && touched && query.trim().length >= 2;

  function onChange(next: string) {
    setQuery(next);
    setTouched(true);
    if (next.trim().length >= 2) {
      setLoading(true);
    } else {
      setLoading(false);
      setResults([]);
    }
  }

  // Debounced search with in-flight cancellation. All setState happens inside
  // async callbacks; `loading` is primed in onChange so there's no empty flash.
  useEffect(() => {
    const q = query.trim();
    if (!editing || !touched || q.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      geocode(q, ctrl.signal)
        .then((r) => {
          setResults(r);
          setActive(0);
          setLoading(false);
        })
        .catch((err) => {
          if (err?.name !== "AbortError") setLoading(false);
        });
    }, 280);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, editing, touched]);

  // Close on outside click — but not when clicking inside the portalled menu.
  useEffect(() => {
    if (!editing) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!rootRef.current?.contains(t) && !dropRef.current?.contains(t)) {
        setEditing(!value ? true : false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [editing, value]);

  // Position the portalled menu under the field (fixed; survives parent
  // stacking/overflow). Imperative style writes only — no re-render churn.
  // Tracked every frame (not just on open/resize/scroll) because the field
  // itself drifts horizontally as you type: the composer pill grows/shrinks
  // under `field-sizing: content`, which is neither a resize nor a scroll —
  // a one-shot placement would anchor to the field's position at open time
  // and drift out of sync as the row keeps resizing.
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = rootRef.current?.getBoundingClientRect();
      const d = dropRef.current;
      if (!r || !d) return;
      const width = d.offsetWidth;
      // Shift left by the row's inner padding so result text lines up with the
      // field's text (the "P" of Paris over the "P" of Paris below).
      const desired = r.left - 16;
      const left = Math.max(
        12,
        Math.min(desired, window.innerWidth - width - 12),
      );
      d.style.left = `${left}px`;
      d.style.top = `${r.bottom + 12}px`;
    };
    place();
    let raf = requestAnimationFrame(function loop() {
      place();
      raf = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

  function choose(r: GeocodeResult) {
    if (!r.geometry) return;
    const place = buildPlace(
      { type: "Feature", geometry: r.geometry, properties: {} },
      { id: r.id, label: r.label, shortLabel: r.shortLabel },
    );
    onSelect(place);
    setEditing(false);
    setQuery("");
    setTouched(false);
    setResults([]);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const selectable = results.filter((r) => r.geometry);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, selectable.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectable[active]) choose(selectable[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditing(!value ? true : false);
      setQuery("");
      inputRef.current?.blur();
    }
  }

  function beginEdit() {
    setEditing(true);
    // Pre-fill with the current value so the field keeps its width (no jump on
    // press); select-all so the first keystroke replaces it.
    setQuery(value?.shortLabel ?? "");
    setTouched(false);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }

  return (
    <span ref={rootRef} className="relative inline-flex items-baseline">
      {!editing && value ? (
        <button
          type="button"
          onClick={beginEdit}
          style={{ color: color?.ink }}
          className="cursor-pointer rounded-sm outline-none transition-opacity hover:opacity-75 focus-visible:ring-2 focus-visible:ring-current/40 focus-visible:ring-offset-2"
        >
          <MorphText text={value.shortLabel} />
        </button>
      ) : (
        <input
          ref={inputRef}
          value={query}
          autoFocus={autoFocus}
          spellCheck={false}
          autoComplete="off"
          placeholder={value?.shortLabel ?? placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setEditing(true)}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          style={{ color: color?.ink, caretColor: "#171717" }}
          className="min-w-[2ch] [field-sizing:content] bg-transparent text-left text-foreground outline-none placeholder:text-foreground/35"
        />
      )}

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={dropRef}
            style={{ position: "fixed", left: 0, top: 0, zIndex: 60 }}
            className="w-[min(23rem,calc(100vw-2rem))]"
          >
            <Glass
              refract={false}
              className="rounded-2xl text-left text-base font-normal tracking-normal text-foreground"
            >
              <div id={listId} role="listbox">
            {loading && results.length === 0 ? (
              <ul className="space-y-1 p-2">
                {[0, 1, 2, 3].map((i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-3 px-2 py-2"
                  >
                    <span className="flex-1 space-y-1.5">
                      <span className="block h-3 w-1/3 rounded-full bg-foreground/10" />
                      <span className="block h-2.5 w-2/3 rounded-full bg-foreground/[0.07]" />
                    </span>
                    <span className="h-3.5 w-10 rounded-full bg-foreground/[0.07]" />
                  </li>
                ))}
              </ul>
            ) : results.length === 0 ? (
              <div className="px-4 py-3 text-sm text-muted-foreground">
                No places found
              </div>
            ) : (
              <ul className="max-h-72 overflow-auto py-1.5">
                {results.map((r, i) => {
                  const selectableIndex = results
                    .slice(0, i)
                    .filter((x) => x.geometry).length;
                  const isActive = !!r.geometry && selectableIndex === active;
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        disabled={!r.geometry}
                        onMouseEnter={() =>
                          r.geometry && setActive(selectableIndex)
                        }
                        onClick={() => choose(r)}
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-2 text-left transition-colors",
                          r.geometry
                            ? "cursor-pointer"
                            : "cursor-default opacity-45",
                          isActive && "bg-foreground/[0.06]",
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {r.shortLabel}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {r.geometry ? r.label : "no boundary available"}
                          </span>
                        </span>
                        <span className="shrink-0 rounded-full bg-foreground/[0.05] px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          {r.kind}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
              </div>
            </Glass>
          </div>,
          document.body,
        )}
    </span>
  );
}
