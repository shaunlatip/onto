"use client";

import { useState } from "react";
import { Glass } from "@/components/Glass";
import MorphText from "@/components/MorphText";
import type { SpanColor } from "@/lib/colors";
import {
  formatMultiple,
  type AreaUnit,
  type Readout as ReadoutData,
} from "@/lib/geo";
import { cn } from "@/lib/utils";

const KM2_PER_MI2 = 2.589988;
const KM_PER_MI = 1.609344;
const METRICS = ["size", "width", "height"] as const;
type Metric = (typeof METRICS)[number];

function fmtNum(km: number, isArea: boolean, unit: AreaUnit): string {
  const v = unit === "km" ? km : km / (isArea ? KM2_PER_MI2 : KM_PER_MI);
  return v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString("en-US");
}

interface ReadoutProps {
  data: ReadoutData;
  referenceColor: SpanColor;
  targetColor: SpanColor;
}

/** The comparison sentence + raw numbers, without any surrounding chrome. Two
 *  size variants: `card` (desktop centered readout) and `bar` (the compact
 *  mobile bottom bar, tucked beside the kebab). Alignment comes from the
 *  wrapper; the `group`/hover affordances need a `group` ancestor (the card's
 *  Glass, or the bar's Glass). */
export function ReadoutContent({
  data,
  referenceColor,
  targetColor,
  variant,
}: ReadoutProps & { variant: "card" | "bar" }) {
  const [metric, setMetric] = useState<Metric>("size");
  const [unit, setUnit] = useState<AreaUnit>("km");

  const pair = data[metric];
  const ratio = pair.familiar / pair.new;
  const sameSize = ratio >= 0.92 && ratio <= 1.08;
  const ratioLabel = formatMultiple(ratio);
  const isArea = metric === "size";
  const unitLabel = isArea
    ? unit === "km"
      ? "km²"
      : "mi²"
    : unit === "km"
      ? "km"
      : "mi";

  const cycleMetric = () =>
    setMetric((m) => METRICS[(METRICS.indexOf(m) + 1) % METRICS.length]);
  const toggleUnit = () => setUnit((u) => (u === "km" ? "mi" : "km"));

  // Affordances (soft grey pill) only show while the bar/card is hovered.
  const pill =
    "pointer-events-auto cursor-pointer rounded-[4px] px-1 py-0.5 transition-colors group-hover:bg-foreground/[0.06] hover:!bg-foreground/[0.12] hover:!text-foreground";

  const aria = sameSize
    ? `${data.familiarName} is about the same ${metric} as ${data.newName}`
    : `${data.familiarName} is ${ratioLabel} the ${metric} of ${data.newName}`;

  const metricBtn = (
    <button
      type="button"
      onClick={cycleMetric}
      className={pill}
      title="Switch metric"
    >
      <MorphText text={metric} />
    </button>
  );

  const bar = variant === "bar";

  return (
    <>
      <p
        className={cn(
          "text-pretty font-medium leading-snug tracking-tight text-foreground/75",
          bar ? "text-sm sm:text-base" : "text-lg",
        )}
        aria-label={aria}
      >
        <MorphText
          text={data.familiarName}
          className="font-semibold transition-colors duration-300"
          style={{ color: referenceColor.ink }}
        />{" "}
        is{" "}
        {sameSize ? (
          <>about the same {metricBtn} as</>
        ) : (
          <>
            <MorphText
              text={ratioLabel}
              className="tabular font-semibold text-foreground"
            />{" "}
            the {metricBtn} of
          </>
        )}{" "}
        <MorphText
          text={data.newName}
          className="font-semibold transition-colors duration-300"
          style={{ color: targetColor.ink }}
        />
      </p>
      <p
        className={cn(
          "tracking-wide text-muted-foreground",
          bar ? "mt-0.5 text-[11px]" : "mt-1 text-xs",
        )}
      >
        <MorphText text={fmtNum(pair.familiar, isArea, unit)} className="tabular" />
        <button type="button" onClick={toggleUnit} className={pill} title="Switch units">
          <MorphText text={unitLabel} />
        </button>{" "}
        <span className="text-muted-foreground/40">·</span>{" "}
        <MorphText text={fmtNum(pair.new, isArea, unit)} className="tabular" />
        <button type="button" onClick={toggleUnit} className={pill} title="Switch units">
          <MorphText text={unitLabel} />
        </button>
      </p>
    </>
  );
}

/** Desktop readout — a centered glass card, bottom-center. Mobile renders the
 *  same content fused into the bottom-bar pill (see BottomBar). */
export default function Readout({
  data,
  referenceColor,
  targetColor,
}: ReadoutProps) {
  return (
    <Glass
      className="span-elastic group pointer-events-auto relative max-w-[min(90vw,30rem)] rounded-2xl px-5 py-4 text-center"
      refract={false}
    >
      <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-foreground/[0.03] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <ReadoutContent
        data={data}
        referenceColor={referenceColor}
        targetColor={targetColor}
        variant="card"
      />
    </Glass>
  );
}
