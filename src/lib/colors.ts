/** A place's color. `line`/`fill` paint the map outline; `ink` is the text-safe
 *  variant for names in the sentence + readout. Fill opacity is set per role
 *  (a faint target vs a more solid reference) in the map layer, not here. */
export interface SpanColor {
  key: string;
  line: string;
  fill: string;
  ink: string;
}

/** Eight distinct, map-legible hues. New places cycle through these in order. */
export const PALETTE: SpanColor[] = [
  { key: "emerald", line: "#0f9d63", fill: "#13a86f", ink: "#0a7a4d" },
  { key: "amber", line: "#d9870a", fill: "#f3a51f", ink: "#a9680a" },
  { key: "indigo", line: "#4f5bd5", fill: "#5d69e0", ink: "#3b46ad" },
  { key: "rose", line: "#df3f74", fill: "#ec5b8c", ink: "#b82a5c" },
  { key: "teal", line: "#0d97a4", fill: "#15b1bf", ink: "#0a7480" },
  { key: "violet", line: "#864ff0", fill: "#9b73f7", ink: "#6a39cc" },
  { key: "coral", line: "#ec6336", fill: "#f4824f", ink: "#c44a20" },
  { key: "blue", line: "#2f6df0", fill: "#4a83f5", ink: "#2356c9" },
];

/** Sequential, session-stable color assignment.
 *  - a never-seen place gets the next color in rotation
 *  - re-selecting a place reuses its original color
 *  - after all 8 are used, the rotation wraps and colors repeat
 *  Live entirely in event handlers (never during render). */
export class ColorAssigner {
  private byId = new Map<string, number>();
  private next = 0;

  colorFor(id: string): SpanColor {
    let idx = this.byId.get(id);
    if (idx === undefined) {
      idx = this.next % PALETTE.length;
      this.byId.set(id, idx);
      this.next += 1;
    }
    return PALETTE[idx];
  }
}
