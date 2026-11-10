/**
 * Upscaling a photo in tiles: the plan, the weights that hide where tiles meet, and the band that blends them.
 * Plain arrays, and the model comes in as a function, so all of it can be tested without one.
 *
 * The model always makes 4 times the size. A tile sees the photo around it, and the first and last `PAD` pixels
 * of each side it shares with a neighbor never count: the network sees zeros past its edge there, and that shows.
 * Between those, the two tiles cross over smoothly. The weights of all tiles add up to exactly 1 everywhere, so a
 * flat photo comes out flat and nothing marks the grid.
 *
 * Only one row of tiles is kept in floating point at a time. Rows of output that no later tile reaches are
 * written out as soon as the row of tiles is done, so memory grows with the width of the photo, not its area.
 */

/** The size the model makes, against the photo it is given. */
export const MODEL_SCALE = 4;
/** Pixels of the photo at a shared side of a tile that never count. */
export const PAD = 8;
/** Pixels of the photo over which one tile hands over to the next. */
export const RAMP = 16;
/** Two neighbors share at least this much of the photo. */
export const OVERLAP = 2 * PAD + RAMP;

/** Upscales one tile. `rgb` holds the planes of red, green and blue of `w` by `h` pixels; the answer, 4 times each side. */
export type Upscale = (rgb: Uint8Array, w: number, h: number) => Promise<Uint8Array>;

export interface Axis {
  /** Where each tile starts, in pixels of the photo. */
  starts: number[];
  /** Length of every tile. */
  size: number;
}

/** Tiles along one side: as few as fit, spread so that every pair overlaps by the same amount, at least `OVERLAP`. */
export function axis(length: number, tile: number): Axis {
  if (tile < 2 * OVERLAP) throw new Error(`tile too small: ${tile}`);
  if (length <= tile) return { starts: [0], size: length };
  const count = Math.ceil((length - OVERLAP) / (tile - OVERLAP));
  const starts: number[] = [];
  for (let i = 0; i < count; i++) starts.push(Math.round((i * (length - tile)) / (count - 1)));
  return { starts, size: tile };
}

const smooth = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

/** Weight of tile `i` before the weights are made to add up: 0 on its shared sides, rising to 1 over the handover. */
function rawWeight(a: Axis, i: number, x: number): number {
  const { starts, size } = a;
  if (x < starts[i] || x >= starts[i] + size) return 0;
  let w = 1;
  if (i > 0) {
    const from = starts[i] + PAD;
    const to = starts[i - 1] + size - PAD;
    w *= smooth((x - from) / (to - from));
  }
  if (i < starts.length - 1) {
    const from = starts[i + 1] + PAD;
    const to = starts[i] + size - PAD;
    w *= 1 - smooth((x - from) / (to - from));
  }
  return w;
}

/**
 * Weight of tile `i` along one side at `x`, a position in pixels of the photo. Two neighbors hand over across what
 * they share, less `PAD` at each end. Where three tiles meet, on a side just longer than two tiles, the weights are
 * divided by their sum, so they always add up to 1. Some tile always counts: neighbors share more than `2 * PAD`.
 */
export function weightAt(a: Axis, i: number, x: number): number {
  const own = rawWeight(a, i, x);
  if (own === 0) return 0;
  let sum = 0;
  for (let j = Math.max(0, i - 2); j <= Math.min(a.starts.length - 1, i + 2); j++) sum += rawWeight(a, j, x);
  return own / sum;
}

/** Weights of one tile at each pixel of the output along one side, `scale` output pixels per pixel of the photo. */
export function weightsOf(a: Axis, i: number, scale: number): Float32Array {
  const n = a.size * scale;
  const out = new Float32Array(n);
  for (let k = 0; k < n; k++) out[k] = weightAt(a, i, a.starts[i] + (k + 0.5) / scale);
  return out;
}

export interface UpscalePlan {
  w: number;
  h: number;
  /** Output pixels per pixel of the photo: 2 or 4. */
  scale: number;
  cols: Axis;
  rows: Axis;
}

export function planUpscale(w: number, h: number, scale: number, tile: number): UpscalePlan {
  if (scale !== 2 && scale !== 4) throw new Error(`scale: ${scale}`);
  return { w, h, scale, cols: axis(w, tile), rows: axis(h, tile) };
}

export const tileCount = (p: UpscalePlan) => p.cols.starts.length * p.rows.starts.length;

/** Averages blocks of `by` by `by` pixels of planar RGB. */
export function shrink(rgb: Uint8Array, w: number, h: number, by: number): Float32Array {
  const ow = w / by;
  const oh = h / by;
  const out = new Float32Array(ow * oh * 3);
  const plane = w * h;
  const k = 1 / (by * by);
  for (let c = 0; c < 3; c++) {
    for (let y = 0; y < oh; y++) {
      for (let x = 0; x < ow; x++) {
        let sum = 0;
        for (let dy = 0; dy < by; dy++) {
          const row = c * plane + (y * by + dy) * w + x * by;
          for (let dx = 0; dx < by; dx++) sum += rgb[row + dx];
        }
        out[c * ow * oh + y * ow + x] = sum * k;
      }
    }
  }
  return out;
}

export interface UpscaleEvents {
  /** A tile is done, of this many. */
  tile(done: number, total: number): void;
  stopped(): boolean;
}

/**
 * Runs the plan over a photo in RGBA and returns the upscaled photo in RGBA, opaque. `out` may be given to write
 * into. Null when stopped halfway.
 */
export async function runUpscale(rgba: Uint8Array | Uint8ClampedArray, plan: UpscalePlan, upscale: Upscale, events: UpscaleEvents, out?: Uint8ClampedArray): Promise<Uint8ClampedArray | null> {
  const { w, h, scale, cols, rows } = plan;
  const ow = w * scale;
  const oh = h * scale;
  const result = out ?? new Uint8ClampedArray(ow * oh * 4);
  if (result.length !== ow * oh * 4) throw new Error('output size');
  const tw = cols.size;
  const th = rows.size;
  const bandH = th * scale;
  // The band holds output rows from `bandTop`, in floating point, for the row of tiles being worked on.
  const band = new Float32Array(ow * bandH * 3);
  let bandTop = 0;
  const colWeights = cols.starts.map((_, i) => weightsOf(cols, i, scale));
  const total = tileCount(plan);
  let done = 0;
  const tileRgb = new Uint8Array(tw * th * 3);

  const flush = (until: number) => {
    // Output rows from `bandTop` up to `until` are final.
    for (let y = bandTop; y < until; y++) {
      const b = (y - bandTop) * ow;
      const o = y * ow * 4;
      for (let x = 0; x < ow; x++) {
        result[o + x * 4] = band[b + x];
        result[o + x * 4 + 1] = band[ow * bandH + b + x];
        result[o + x * 4 + 2] = band[2 * ow * bandH + b + x];
        result[o + x * 4 + 3] = 255;
      }
    }
    // What is left moves to the top of the band, and the rest starts empty.
    const keep = bandTop + bandH - until;
    for (let c = 0; c < 3; c++) {
      const plane = band.subarray(c * ow * bandH, (c + 1) * ow * bandH);
      plane.copyWithin(0, (until - bandTop) * ow, bandH * ow);
      plane.fill(0, Math.max(0, keep) * ow);
    }
    bandTop = until;
  };

  for (let r = 0; r < rows.starts.length; r++) {
    const ty = rows.starts[r];
    const oy = ty * scale;
    // The band must start at this row of tiles: rows above it are final.
    if (oy > bandTop) flush(oy);
    const rowWeights = weightsOf(rows, r, scale);
    for (let c = 0; c < cols.starts.length; c++) {
      if (events.stopped()) return null;
      const tx = cols.starts[c];
      for (let y = 0; y < th; y++) {
        for (let x = 0; x < tw; x++) {
          const at = ((ty + y) * w + tx + x) * 4;
          const k = y * tw + x;
          tileRgb[k] = rgba[at];
          tileRgb[tw * th + k] = rgba[at + 1];
          tileRgb[2 * tw * th + k] = rgba[at + 2];
        }
      }
      const big = await upscale(tileRgb.slice(), tw, th);
      if (events.stopped()) return null;
      const by = MODEL_SCALE / scale;
      const sw = tw * scale;
      const sh = th * scale;
      const part = by === 1 ? Float32Array.from(big) : shrink(big, tw * MODEL_SCALE, th * MODEL_SCALE, by);
      const wx = colWeights[c];
      const ox = tx * scale;
      for (let ch = 0; ch < 3; ch++) {
        const plane = ch * ow * bandH;
        const src = ch * sw * sh;
        for (let y = 0; y < sh; y++) {
          const wy = rowWeights[y];
          if (wy === 0) continue;
          const b = plane + (oy + y - bandTop) * ow + ox;
          const s = src + y * sw;
          for (let x = 0; x < sw; x++) band[b + x] += part[s + x] * wy * wx[x];
        }
      }
      events.tile(++done, total);
    }
  }
  flush(oh);
  return result;
}
