/**
 * Picks a filter for a photo from its tone. Each filter is tried on the photo's own colors and the result
 * is scored, so a new filter file takes part with no change here. It is only a suggestion: the panel
 * shows it and the person chooses.
 */

import { rgbToLab, type RGB } from '../core/color';
import { buildLut, type FilterData } from './luts';

/** The tone of a photo, in the Lab scale. */
export interface Tone {
  /** Mean lightness, 0..100. */
  light: number;
  /** Distance from the darkest 5% to the lightest 5% of the lightness. */
  range: number;
  /** Mean of a* and b*, over the colors that are neither near black nor near white. */
  a: number;
  b: number;
  /** Mean colorfulness over those same colors. */
  chroma: number;
  /** Share of pixels burned to white or crushed to black. */
  clipped: number;
}

export type Fault = 'dark' | 'bright' | 'flat' | 'hard' | 'cold' | 'warm' | 'dull' | 'loud';

export interface Suggestion {
  id: string;
  /** What was off in the photo and this filter eases most. Null when it eases nothing in particular. */
  fault: Fault | null;
  /** The score of each filter tried, best first, to be read in tests. */
  ranking: { id: string; score: number }[];
}

/** Where a pleasant portrait tends to sit, and how far from it counts as one step of fault. */
const TARGET = {
  light: { at: 58, step: 10 },
  range: { at: 70, step: 15 },
  warm: { at: 13, step: 7 },
  red: { at: 9, step: 7 },
  chroma: { at: 22, step: 8 },
};

/** How much one Lab unit of change costs. Without it, the strongest filter would always win. */
const CHANGE_COST = 0.03;
const CLIP_COST = 12;
/** The intensity the panel gives a filter on the first tap. */
const FIRST_INTENSITY = 0.85;
/** The table is only read on the small sample of a thumbnail, so few nodes are enough. */
const TABLE_SIZE = 9;
/** Below this many steps of distance from the target, that side of the photo is called fine. */
const FAULT_MIN = 0.6;
/** A filter must close at least this many steps for the words to credit it. */
const MIN_EASED = 0.25;

const gaps = (t: Tone) => ({
  light: (t.light - TARGET.light.at) / TARGET.light.step,
  range: (t.range - TARGET.range.at) / TARGET.range.step,
  warm: (t.b - TARGET.warm.at) / TARGET.warm.step,
  red: (t.a - TARGET.red.at) / TARGET.red.step,
  chroma: (t.chroma - TARGET.chroma.at) / TARGET.chroma.step,
});

/** Reads the tone from RGB values in 0..1, packed three per pixel. */
export function readTone(rgb: Float32Array): Tone {
  const n = rgb.length / 3;
  const lights = new Float32Array(n);
  let light = 0;
  let a = 0;
  let b = 0;
  let chroma = 0;
  let mid = 0;
  let clipped = 0;
  for (let i = 0; i < n; i++) {
    const c: RGB = [rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]];
    const lab = rgbToLab(c);
    lights[i] = lab[0];
    light += lab[0];
    if (Math.max(...c) > 0.995 || Math.min(...c) < 0.005) clipped++;
    if (lab[0] > 15 && lab[0] < 92) {
      a += lab[1];
      b += lab[2];
      chroma += Math.hypot(lab[1], lab[2]);
      mid++;
    }
  }
  lights.sort();
  const share = 1 / Math.max(mid, 1);
  return {
    light: light / n,
    range: lights[Math.floor(n * 0.95)] - lights[Math.floor(n * 0.05)],
    a: a * share,
    b: b * share,
    chroma: chroma * share,
    clipped: clipped / n,
  };
}

function toneCost(t: Tone): number {
  const g = gaps(t);
  return g.light ** 2 + g.range ** 2 + g.warm ** 2 + g.red ** 2 + g.chroma ** 2 + CLIP_COST * t.clipped;
}

/**
 * What a filter really eases in a photo: of what is off before, the thing it brings closest to the target.
 * Null when it eases nothing that was off, so the words never promise what the filter does not do.
 */
export function easedFault(before: Tone, after: Tone): Fault | null {
  const g0 = gaps(before);
  const g1 = gaps(after);
  const names: [number, number, Fault, Fault][] = [
    [g0.light, g1.light, 'dark', 'bright'],
    [g0.range, g1.range, 'flat', 'hard'],
    [g0.warm, g1.warm, 'cold', 'warm'],
    [g0.chroma, g1.chroma, 'dull', 'loud'],
  ];
  let best: Fault | null = null;
  let eased = MIN_EASED;
  for (const [from, to, low, high] of names) {
    if (Math.abs(from) < FAULT_MIN || Math.abs(from) - Math.abs(to) < eased) continue;
    eased = Math.abs(from) - Math.abs(to);
    best = from < 0 ? low : high;
  }
  return best;
}

/** Runs the pixels through a filter table, at the intensity of the first tap. */
function throughFilter(rgb: Float32Array, table: Float32Array, size: number, out: Float32Array, vignette: number): void {
  const last = size - 1;
  const k = FIRST_INTENSITY;
  // The sample is a crop, so the vignette is only felt as a little less light overall.
  const dim = 1 - (k * vignette * 0.85 * 0.25) / 100;
  for (let p = 0; p < rgb.length; p += 3) {
    const x = rgb[p] * last;
    const y = rgb[p + 1] * last;
    const z = rgb[p + 2] * last;
    const ix = Math.min(Math.floor(x), last - 1);
    const iy = Math.min(Math.floor(y), last - 1);
    const iz = Math.min(Math.floor(z), last - 1);
    const fx = x - ix;
    const fy = y - iy;
    const fz = z - iz;
    for (let ch = 0; ch < 3; ch++) {
      let v = 0;
      for (let corner = 0; corner < 8; corner++) {
        const dx = corner & 1;
        const dy = (corner >> 1) & 1;
        const dz = (corner >> 2) & 1;
        const w = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz);
        if (w > 0) v += w * table[(((iz + dz) * size + iy + dy) * size + ix + dx) * 4 + ch];
      }
      out[p + ch] = (rgb[p + ch] + (v - rgb[p + ch]) * k) * dim;
    }
  }
}

function meanChange(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  // Every fifth pixel is plenty for this average, and Lab is the slow part.
  const stride = 15;
  for (let p = 0; p < a.length; p += stride) {
    const la = rgbToLab([a[p], a[p + 1], a[p + 2]]);
    const lb = rgbToLab([b[p], b[p + 1], b[p + 2]]);
    sum += Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
  }
  return sum / Math.ceil(a.length / stride);
}

/** Chooses from `filters` for a photo sampled as RGBA bytes. Returns null only when no filter can be suggested. */
export function suggestFilter(rgba: Uint8Array, filters: FilterData[]): Suggestion | null {
  const n = rgba.length / 4;
  const rgb = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    rgb[i * 3] = rgba[i * 4] / 255;
    rgb[i * 3 + 1] = rgba[i * 4 + 1] / 255;
    rgb[i * 3 + 2] = rgba[i * 4 + 2] / 255;
  }
  const out = new Float32Array(rgb.length);
  const before = readTone(rgb);
  const ranking: { id: string; score: number }[] = [];
  let bestScore = Infinity;
  let fault: Fault | null = null;
  for (const filter of filters) {
    if (filter.suggest === false) continue;
    throughFilter(rgb, buildLut(filter, TABLE_SIZE), TABLE_SIZE, out, filter.vignette ?? 0);
    const after = readTone(out);
    const score = toneCost(after) + CHANGE_COST * meanChange(rgb, out) ** 2;
    ranking.push({ id: filter.id, score });
    if (score < bestScore) {
      bestScore = score;
      fault = easedFault(before, after);
    }
  }
  if (!ranking.length) return null;
  ranking.sort((a, b) => a.score - b.score);
  return { id: ranking[0].id, fault, ranking };
}
