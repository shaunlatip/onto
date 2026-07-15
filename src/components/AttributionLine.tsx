import { ATTRIBUTION } from "@/lib/map";
import { cn } from "@/lib/utils";

/** Data credits as a single quiet line — sits at the bottom of the Onto menu
 *  (desktop panel and mobile sheet), styled for their dark surface. */
export default function AttributionLine({ className }: { className?: string }) {
  return (
    <p className={cn("text-[10px] leading-relaxed text-white/35", className)}>
      {ATTRIBUTION.map((a, i) => (
        <span key={a.label}>
          {i > 0 && <span className="text-white/20"> · </span>}
          {a.href ? (
            <a
              href={a.href}
              target="_blank"
              rel="noreferrer noopener"
              className="underline-offset-2 transition-colors hover:text-white/70 hover:underline"
            >
              {a.label}
            </a>
          ) : (
            a.label
          )}
        </span>
      ))}
    </p>
  );
}
