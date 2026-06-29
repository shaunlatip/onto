// Generate an edge-concentrated displacement (normal) map for a rounded rect:
// zero in the center (no refraction), full strength at the rim (strong inward
// refraction) — the thing the feTurbulence approach is missing, which warps
// uniformly instead. R encodes x-shift, G encodes y-shift; 0.5 = "no shift"
// per feDisplacementMap (displacement = scale * (channel - 0.5)).
//
// `bevel` = px band from the edge over which the lens ramps. Small bevel = a
// hard glassy rim; large bevel = a soft pillow that bends more of the backdrop.
export function makeNormalMap(
  w: number,
  h: number,
  radius: number,
  bevel: number,
): string {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const img = ctx.createImageData(w, h);

  const hw = w / 2;
  const hh = h / 2;
  const r = Math.min(radius, hw, hh);
  // signed distance to the rounded-rect edge (negative inside, positive outside)
  const sd = (px: number, py: number) => {
    const qx = Math.abs(px - hw) - (hw - r);
    const qy = Math.abs(py - hh) - (hh - r);
    const ax = Math.max(qx, 0);
    const ay = Math.max(qy, 0);
    return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const d = sd(x, y);
      const depth = -d; // >0 inside the shape
      // rim band: 1 right at the edge, easing to 0 once we're `bevel` px inside.
      let band = depth <= 0 ? 0 : Math.max(0, 1 - depth / bevel);
      band = Math.sin((band * Math.PI) / 2); // ease so the lens looks curved
      // inward unit normal = -gradient(sd) (sd grows outward)
      let nx = -(sd(x + 1, y) - sd(x - 1, y)) * 0.5;
      let ny = -(sd(x, y + 1) - sd(x, y - 1)) * 0.5;
      const len = Math.hypot(nx, ny) || 1;
      nx /= len;
      ny /= len;
      // full channel swing at the rim → real displacement of scale*0.5 px there
      img.data[i] = Math.round(255 * (0.5 + nx * band * 0.5));
      img.data[i + 1] = Math.round(255 * (0.5 + ny * band * 0.5));
      img.data[i + 2] = 128;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}
