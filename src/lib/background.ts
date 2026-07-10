/** Options for the app shell background — visible around/behind the globe. */
export interface BackgroundOption {
  key: string;
  label: string;
  description: string;
  className: string;
}

export const BACKGROUND_STYLES: BackgroundOption[] = [
  {
    key: "light",
    label: "Light",
    description: "A neutral gray.",
    className: "bg-[#eef0f2]",
  },
  {
    key: "space",
    label: "Space",
    description: "Near-black, with a drifting starfield.",
    className: "bg-[#0c0f1a]",
  },
];

export const DEFAULT_BACKGROUND_KEY = "space";

export function backgroundClassName(key: string): string {
  return (
    BACKGROUND_STYLES.find((b) => b.key === key) ??
    BACKGROUND_STYLES.find((b) => b.key === DEFAULT_BACKGROUND_KEY)!
  ).className;
}
