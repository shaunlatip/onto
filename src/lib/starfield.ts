/** Procedural, tileable star field for the "Space" background — sparse dots
 *  (leaning a touch toward loose clusters, not a uniform scatter), mostly
 *  near-white with about a third carrying a slight, realistic stellar tint
 *  (blue-white, sun-like yellow-white, orange, red), rendered as a small SVG
 *  data URI so it can tile via a CSS background-image. */

interface StarfieldOptions {
  /** Tile is square: size x size px. */
  size: number;
  count: number;
  minRadius: number;
  maxRadius: number;
  minOpacity: number;
  maxOpacity: number;
  seed: number;
}

interface StarTone {
  hue: [number, number];
  sat: [number, number];
  light: [number, number];
  weight: number;
}

/** Realistic stellar color temperatures — only applied to ~1/3 of stars,
 *  weighted toward the hotter/cooler-white end (rarer to see a vivid red or
 *  orange with the naked eye, but a couple should show up). */
const REALISTIC_STAR_TONES: StarTone[] = [
  { hue: [206, 226], sat: [28, 52], light: [80, 92], weight: 3 }, // blue-white
  { hue: [42, 55], sat: [18, 36], light: [85, 93], weight: 3 }, // sun-like yellow-white
  { hue: [25, 36], sat: [32, 52], light: [74, 85], weight: 2 }, // orange
  { hue: [4, 15], sat: [38, 58], light: [64, 78], weight: 1 }, // red
];

/** mulberry32 — small deterministic PRNG so a given seed always yields the
 *  same field (stable across re-renders, no per-mount reshuffle). */
function mulberry32(seed: number) {
  let a = seed;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function between(rand: () => number, [a, b]: [number, number]) {
  return a + rand() * (b - a);
}

/** Roughly bell-shaped noise in [-1, 1] (sum of uniforms — cheap Irwin-Hall
 *  stand-in), used to jitter a star around a cluster center. */
function gaussianish(rand: () => number) {
  return (rand() + rand() + rand() - 1.5) / 1.5;
}

function wrap(v: number, size: number) {
  const m = v % size;
  return m < 0 ? m + size : m;
}

function pickFill(rand: () => number): string {
  const varied = rand() < 1 / 3;
  if (!varied) {
    const h = between(rand, [200, 220]);
    const s = between(rand, [4, 14]);
    const l = between(rand, [93, 99]);
    return `hsl(${h.toFixed(0)} ${s.toFixed(0)}% ${l.toFixed(0)}%)`;
  }
  const total = REALISTIC_STAR_TONES.reduce((sum, t) => sum + t.weight, 0);
  let r = rand() * total;
  let tone = REALISTIC_STAR_TONES[0];
  for (const t of REALISTIC_STAR_TONES) {
    if (r < t.weight) {
      tone = t;
      break;
    }
    r -= t.weight;
  }
  const h = between(rand, tone.hue);
  const s = between(rand, tone.sat);
  const l = between(rand, tone.light);
  return `hsl(${h.toFixed(0)} ${s.toFixed(0)}% ${l.toFixed(0)}%)`;
}

export function starfieldDataUri({
  size,
  count,
  minRadius,
  maxRadius,
  minOpacity,
  maxOpacity,
  seed,
}: StarfieldOptions): string {
  const rand = mulberry32(seed);

  // A handful of soft cluster centers per tile — about half the stars lean
  // toward one, for placement that reads a little grouped without clumping.
  const clusterCount = Math.max(2, Math.round(size / 150));
  const clusters = Array.from({ length: clusterCount }, () => ({
    x: rand() * size,
    y: rand() * size,
  }));
  const clusterJitter = size * 0.08;

  const dots: string[] = [];
  for (let i = 0; i < count; i++) {
    let x: number;
    let y: number;
    if (rand() < 0.5) {
      const c = clusters[Math.floor(rand() * clusters.length)];
      x = wrap(c.x + gaussianish(rand) * clusterJitter, size);
      y = wrap(c.y + gaussianish(rand) * clusterJitter, size);
    } else {
      x = rand() * size;
      y = rand() * size;
    }
    const r = between(rand, [minRadius, maxRadius]).toFixed(2);
    const o = between(rand, [minOpacity, maxOpacity]).toFixed(2);
    const fill = pickFill(rand);
    dots.push(
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${fill}" fill-opacity="${o}"/>`,
    );
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${dots.join("")}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
