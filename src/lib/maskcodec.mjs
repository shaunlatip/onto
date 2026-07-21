// Binary land-mask codec — full coastline detail at ~1/7 the JSON size.
//
// The detailed mask (data/land-mask.json) is 60 MB of unrounded doubles; the
// client needs its full resolution (city-scale clips) without the download or
// the ~200 MB of [x,y] arrays JSON.parse would materialize on a phone. So:
// quantize to 1e-5° (~1.1 m, far below the source's ~0.003° vertex spacing),
// delta + zigzag + varint encode each ring, and keep a per-polygon byte span
// so rings hydrate lazily — decodeIndex() walks bboxes only; a clip hydrates
// just the handful of polygons whose bbox overlaps the feature.
//
// Layout (little-endian):
//   "OMSK" magic, uint32 polygon count
//   per polygon: bbox 4×float64 (32 B) · uint32 payload byte length · payload
//   payload: varint ring count · per ring: varint vertex count ·
//            zigzag-varint lon,lat (absolute for the first vertex, deltas after)
//
// Pure ESM, no Node built-ins — shared by scripts/build-client-masks.mjs and
// the browser clip worker (same pattern as landclip-core.mjs).

const MAGIC = 0x4f4d534b; // "OMSK"
export const QUANT = 1e5; // 1e-5° ≈ 1.1 m

const zigzag = (n) => (n << 1) ^ (n >> 31);
const unzigzag = (n) => (n >>> 1) ^ -(n & 1);

class ByteWriter {
  constructor() {
    this.buf = new Uint8Array(1 << 20);
    this.len = 0;
  }
  ensure(extra) {
    if (this.len + extra <= this.buf.length) return;
    let cap = this.buf.length * 2;
    while (cap < this.len + extra) cap *= 2;
    const next = new Uint8Array(cap);
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
  }
  varint(v) {
    this.ensure(5);
    while (v > 0x7f) {
      this.buf[this.len++] = (v & 0x7f) | 0x80;
      v >>>= 7;
    }
    this.buf[this.len++] = v;
  }
  bytes() {
    return this.buf.subarray(0, this.len);
  }
}

function readVarint(view, state) {
  let v = 0;
  let shift = 0;
  for (;;) {
    const b = view[state.o++];
    v |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) return v >>> 0;
    shift += 7;
  }
}

/**
 * Encode [{ b:[minx,miny,maxx,maxy], c: PolygonRings }] to an ArrayBuffer.
 * Coordinates are quantized to 1e-5°; bboxes are stored as float64 verbatim
 * (they only feed the overlap pre-filter).
 */
export function encodeMask(polys) {
  const payloads = [];
  let total = 8; // magic + count
  for (const p of polys) {
    const w = new ByteWriter();
    w.varint(p.c.length);
    for (const ring of p.c) {
      w.varint(ring.length);
      let px = 0;
      let py = 0;
      for (const [lon, lat] of ring) {
        const x = Math.round(lon * QUANT);
        const y = Math.round(lat * QUANT);
        w.varint(zigzag(x - px) >>> 0);
        w.varint(zigzag(y - py) >>> 0);
        px = x;
        py = y;
      }
    }
    const bytes = w.bytes();
    payloads.push(bytes);
    total += 32 + 4 + bytes.length;
  }

  const out = new ArrayBuffer(total);
  const dv = new DataView(out);
  const u8 = new Uint8Array(out);
  let o = 0;
  dv.setUint32(o, MAGIC, true);
  o += 4;
  dv.setUint32(o, polys.length, true);
  o += 4;
  for (let i = 0; i < polys.length; i++) {
    const { b } = polys[i];
    for (let k = 0; k < 4; k++) {
      dv.setFloat64(o, b[k], true);
      o += 8;
    }
    dv.setUint32(o, payloads[i].length, true);
    o += 4;
    u8.set(payloads[i], o);
    o += payloads[i].length;
  }
  return out;
}

/**
 * Walk the buffer's fixed-size headers only (no varint decoding): returns
 * [{ b, o, l }] — bbox, payload offset, payload length — for bbox filtering.
 */
export function decodeIndex(buffer) {
  const dv = new DataView(buffer);
  if (dv.getUint32(0, true) !== MAGIC) throw new Error("not an OMSK mask");
  const count = dv.getUint32(4, true);
  const index = new Array(count);
  let o = 8;
  for (let i = 0; i < count; i++) {
    const b = [
      dv.getFloat64(o, true),
      dv.getFloat64(o + 8, true),
      dv.getFloat64(o + 16, true),
      dv.getFloat64(o + 24, true),
    ];
    const l = dv.getUint32(o + 32, true);
    o += 36;
    index[i] = { b, o, l };
    o += l;
  }
  return index;
}

/** Decode one polygon's rings from its index entry. */
export function hydratePolygon(buffer, entry) {
  const view = new Uint8Array(buffer, entry.o, entry.l);
  const state = { o: 0 };
  const ringCount = readVarint(view, state);
  const rings = new Array(ringCount);
  for (let r = 0; r < ringCount; r++) {
    const n = readVarint(view, state);
    const ring = new Array(n);
    let x = 0;
    let y = 0;
    for (let i = 0; i < n; i++) {
      x += unzigzag(readVarint(view, state));
      y += unzigzag(readVarint(view, state));
      ring[i] = [x / QUANT, y / QUANT];
    }
    rings[r] = ring;
  }
  return rings;
}
