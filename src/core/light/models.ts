/**
 * What the two models of Luzes read and give back, as plain numbers: the sizes they want, and the photo as the
 * planes of floats they take. No browser APIs, so every step can be tested.
 *
 * - Depth Anything V2 Small says how far each point is from the camera, as a disparity: larger is nearer.
 * - MODNet says how much of each point is a person, with the soft edge that hair has.
 */

/** Long side of the photo as the depth model sees it. Its sides are multiples of 14, the patch of the network. */
export const DEPTH_SIDE = 518;
const DEPTH_STEP = 14;
/** Short side of the photo as the matte model sees it, and the longest its other side may be. Multiples of 32. */
export const MATTE_SIDE = 512;
const MATTE_LONG = 1024;
const MATTE_STEP = 32;

export interface Grid {
  w: number;
  h: number;
}

const snap = (v: number, step: number) => Math.max(step, Math.round(v / step) * step);

/** The size the depth model reads a photo at. */
export function depthSize(w: number, h: number): Grid {
  const k = DEPTH_SIDE / Math.max(w, h);
  return { w: snap(w * k, DEPTH_STEP), h: snap(h * k, DEPTH_STEP) };
}

/** The size the matte model reads a photo at. */
export function matteSize(w: number, h: number): Grid {
  const k = Math.min(MATTE_SIDE / Math.min(w, h), MATTE_LONG / Math.max(w, h));
  return { w: snap(w * k, MATTE_STEP), h: snap(h * k, MATTE_STEP) };
}

/** How each model wants its colors: `(value / 255 - mean) / std`, one pair per channel. */
export const DEPTH_NORM = { mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225] } as const;
export const MATTE_NORM = { mean: [0.5, 0.5, 0.5], std: [0.5, 0.5, 0.5] } as const;

/** RGBA bytes as three planes of floats, red first, the way both models take a photo. */
export function toPlanes(rgba: Uint8Array | Uint8ClampedArray, w: number, h: number, norm: { mean: readonly number[]; std: readonly number[] }): Float32Array {
  const n = w * h;
  const out = new Float32Array(n * 3);
  for (let c = 0; c < 3; c++) {
    const mean = norm.mean[c];
    const scale = 1 / norm.std[c];
    const plane = c * n;
    for (let i = 0; i < n; i++) out[plane + i] = (rgba[i * 4 + c] / 255 - mean) * scale;
  }
  return out;
}

/** A plane of floats on another grid, each point read between its four neighbors. */
export function resample(src: Float32Array, sw: number, sh: number, dw: number, dh: number): Float32Array {
  if (sw === dw && sh === dh) return src;
  const out = new Float32Array(dw * dh);
  const kx = sw / dw;
  const ky = sh / dh;
  for (let y = 0; y < dh; y++) {
    const fy = Math.min(sh - 1, Math.max(0, (y + 0.5) * ky - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(sh - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < dw; x++) {
      const fx = Math.min(sw - 1, Math.max(0, (x + 0.5) * kx - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(sw - 1, x0 + 1);
      const tx = fx - x0;
      const top = src[y0 * sw + x0] * (1 - tx) + src[y0 * sw + x1] * tx;
      const bottom = src[y1 * sw + x0] * (1 - tx) + src[y1 * sw + x1] * tx;
      out[y * dw + x] = top * (1 - ty) + bottom * ty;
    }
  }
  return out;
}
