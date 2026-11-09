/**
 * The vignette and the grain of the last render stage, on the CPU. The formulas follow `finish.frag`, so what
 * the script measures goes straight into a filter file on the same scales as the Ajustes panel.
 */

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** How far the vignette reaches at a position, with `u` and `v` in 0..1 over the frame. */
export function vignetteShape(u, v) {
  const q = smoothstep(0.35, 1.45, Math.hypot((u - 0.5) * 2, (v - 0.5) * 2));
  return q * q * (3 - 2 * q);
}

/** Applies a vignette of `amount` (-1..1) with the shape value `s`. */
export function vignetteOn(c, amount, s) {
  return amount > 0 ? c * (1 - amount * 0.85 * s) : c + (1 - c) * (-amount * 0.7 * s);
}

/** Takes the vignette back out. */
export function vignetteOff(c, amount, s) {
  if (amount > 0) return c / Math.max(1 - amount * 0.85 * s, 0.05);
  const k = -amount * 0.7 * s;
  return (c - k) / Math.max(1 - k, 0.05);
}

const fract = (x) => x - Math.floor(x);

function hash12(x, y) {
  let a = fract(x * 0.1031);
  let b = fract(y * 0.1031);
  let c = fract(x * 0.1031);
  const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
  a += d;
  b += d;
  c += d;
  return fract((a + b) * c);
}

function valueNoise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let fx = x - ix;
  let fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const top = hash12(ix, iy) * (1 - fx) + hash12(ix + 1, iy) * fx;
  const bottom = hash12(ix, iy + 1) * (1 - fx) + hash12(ix + 1, iy + 1) * fx;
  return top * (1 - fy) + bottom * fy;
}

const GRAIN_CELLS = 1500;

/** The noise of `finish.frag` at a position, with `u` and `v` in 0..1 over the photo. */
export function grainNoise(u, v) {
  const x = u * GRAIN_CELLS;
  const y = v * GRAIN_CELLS;
  return valueNoise(x, y) * 0.6 + valueNoise(x * 2.13 + 17, y * 2.13 + 17) * 0.4 - 0.5;
}

/** How much grain shows at a lightness: most on the mid tones. */
export const grainWeight = (l) => 0.35 + 0.65 * (1 - Math.abs(l * 2 - 1));

export const GRAIN_GAIN = 0.22;
