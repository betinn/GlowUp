/**
 * The teeth as the photo shows them, inside the opening of the mouth the landmarks give. Plain arrays and no
 * browser APIs, so every step can be tested. Like the other limits, the shape lives in memory for the open
 * photo and never reaches the saved project.
 *
 * The opening of the model is only where teeth may be: it also holds the inner side of the lips, the gums,
 * the tongue and the dark of the mouth. What tells them apart is the color without its brightness. Lips,
 * gums and tongue are red; teeth are white, gray or yellow, never red, and that holds in the shadow at the
 * back of the mouth too. The dark of the mouth has no color to read, so it goes by its brightness.
 */

import { softBlur, type Area, type Point } from './mask';
import { cover, smooth } from './skin';

/** The lips are sampled this deep inside their outline, as a share of the mouth width. */
const LIP_CORE = 0.012;
/** Teeth are brighter than the lips: when the brightest of the opening is darker than this share of them, it is no tooth. */
const BRIGHT_SHARE = 0.85;
/** The color and the brightness of the teeth are read on this share of the opening, the brightest. */
const BRIGHTEST = 0.15;
/** Below this luma a pixel has no color to read; from the second on it has. */
const DIM_FROM = 0.04;
const DIM_TO = 0.15;
/**
 * Below this distance between the color of the lips and that of the brightest of the opening, in their own
 * spread, the photo shows no teeth: the opening is lips, tongue and the dark of the mouth.
 */
const MIN_APART = 1.5;
/** The lips are redder than the teeth by at least this much, in red minus green over the sum of the channels. */
const MIN_REDDER = 0.04;
/** The least spread of a color sample, as a variance, so that a flat one does not divide by zero. */
const SPREAD_FLOOR = 1e-5;
/** Position on the way from the color of the teeth to the color of the lips. Past the first it starts to be lip. */
const TEETH_FROM = 0.4;
const TEETH_TO = 0.6;
/**
 * The dark of the mouth, as a share of the brightness of the teeth. The teeth at the back are in shadow, at
 * a fourth to a half of the brightness of the front ones, and the gap between the lips is below that.
 */
const DARK_FROM = 0.12;
const DARK_TO = 0.22;
/** Below this share of the brightness of the teeth, each step darker moves a pixel this much toward the lips. */
const SHADE_FROM = 0.6;
const SHADE = 0.6;
/** A pixel this sure is teeth, and a piece of teeth needs at least this many of them. */
const SURE = 0.5;
const MIN_PIXELS = 12;
/** Pieces of teeth must reach this far inside the inner contour; a glint on the lip does not. */
const CORE_DEPTH = 0.75;
/** Noise of the photo is calmed over this size, and the edge is this soft, as shares of the mouth width. */
const CALM = 0.004;
const FEATHER = 0.004;
/** Gaps between the teeth up to about this size, as a share of the mouth width, are filled. */
const GAP = 0.006;

const quantile = (list: number[], share: number) => list.sort((a, b) => a - b)[Math.min(list.length - 1, Math.floor(list.length * share))];

/**
 * How much each pixel of `area` is a tooth, from 0 to 1, inside `opening`. `inner` and `outer` are the
 * contours of the lips on the grid; the color of the lips is read between them. Null when the photo shows
 * no teeth in the opening.
 */
export function teethFromPhoto(
  rgba: Uint8ClampedArray,
  area: Area,
  opening: readonly Point[],
  inner: readonly Point[],
  outer: readonly Point[],
  width: number,
): Float32Array | null {
  const { w, h } = area;
  const n = w * h;
  const room = cover(opening, area);
  const mouth = cover(inner, area);
  const lips = cover(outer, area);
  const ring = new Float32Array(n);
  for (let i = 0; i < n; i++) ring[i] = lips[i] * (1 - room[i]);
  const lipCore = softBlur(ring, w, h, Math.max(0.6, width * LIP_CORE));
  // Color without brightness: how much redder than green, and how much greener than blue, which is yellow.
  const red = new Float32Array(n);
  const yellow = new Float32Array(n);
  const luma = new Float32Array(n);
  const lip: number[] = [];
  for (let i = 0; i < n; i++) {
    const R = rgba[i * 4];
    const G = rgba[i * 4 + 1];
    const B = rgba[i * 4 + 2];
    red[i] = (R - G) / (R + G + B + 1);
    yellow[i] = (G - B) / (R + G + B + 1);
    luma[i] = (0.2126 * R + 0.7152 * G + 0.0722 * B) / 255;
    if (lipCore[i] > 0.9) lip.push(i);
  }
  // A small mouth has no pixel that deep: then all of the lips tell.
  if (lip.length < MIN_PIXELS) for (let i = 0; i < n; i++) if (ring[i] > 0.5) lip.push(i);
  if (lip.length < MIN_PIXELS) return null;
  // The teeth are the brightest of the opening.
  const open: number[] = [];
  for (let i = 0; i < n; i++) if (mouth[i] > 0.5) open.push(i);
  if (open.length < MIN_PIXELS) return null;
  open.sort((p, q) => luma[q] - luma[p]);
  const top = open.slice(0, Math.max(MIN_PIXELS, Math.round(open.length * BRIGHTEST)));
  const lipY = quantile(lip.map((i) => luma[i]), 0.5);
  const teethY = quantile(top.map((i) => luma[i]), 0.5);
  if (teethY < lipY * BRIGHT_SHARE) return null;
  const axis = split(top, lip, red, yellow);
  if (!axis) return null;
  // The dark of the mouth has no color to read: it must not spill its noise on the teeth beside it.
  const calm = Math.max(0.5, width * CALM);
  const weight = new Float32Array(n);
  const weighted = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    weight[i] = smooth(DIM_FROM, DIM_TO, luma[i]);
    weighted[i] = axis.at(red[i], yellow[i]) * weight[i];
  }
  const sum = softBlur(weighted, w, h, calm);
  const sumWeight = softBlur(weight, w, h, calm);
  const lumaCalm = softBlur(luma, w, h, calm);
  const along = new Float32Array(n);
  for (let i = 0; i < n; i++) along[i] = sumWeight[i] > 1e-3 ? sum[i] / sumWeight[i] : 1;
  const like = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const ratio = lumaCalm[i] / teethY;
    // In the shade a color is less sure, so a dim pixel must be closer to the teeth to count.
    const doubt = along[i] + SHADE * Math.max(0, SHADE_FROM - ratio);
    like[i] = (1 - smooth(TEETH_FROM, TEETH_TO, doubt)) * smooth(DARK_FROM, DARK_TO, ratio) * room[i];
  }
  // Only the pieces that reach deep inside the inner contour: a glint on a lip is white too.
  const kept = reaching(like, mouth, w, h);
  if (!kept) return null;
  const closed = softBlur(kept, w, h, Math.max(1, width * GAP));
  const shape = new Float32Array(n);
  for (let i = 0; i < n; i++) shape[i] = Math.max(kept[i], smooth(0.55, 0.85, closed[i]) * room[i]);
  // At least a pixel of softness, so that the edge of a small mouth does not show the steps of the grid.
  const soft = softBlur(shape, w, h, Math.max(1, width * FEATHER));
  for (let i = 0; i < n; i++) soft[i] *= room[i];
  return soft;
}

const mean = (list: number[], of: Float32Array) => list.reduce((s, i) => s + of[i], 0) / list.length;

/**
 * The line in color that best tells the two samples apart, the way of Fisher: 0 is the mean color of the
 * teeth and 1 that of the lips. `apart` is how far apart they are, in their own spread. Null when the photo
 * cannot tell them apart.
 */
function split(teeth: number[], lips: number[], a: Float32Array, b: Float32Array): { at: (x: number, y: number) => number; apart: number } | null {
  const ta = mean(teeth, a);
  const tb = mean(teeth, b);
  const la = mean(lips, a);
  const lb = mean(lips, b);
  // Spread of each sample around its mean, added.
  let saa = SPREAD_FLOOR;
  let sab = 0;
  let sbb = SPREAD_FLOOR;
  for (const [list, ma, mb] of [
    [teeth, ta, tb],
    [lips, la, lb],
  ] as const) {
    for (const i of list) {
      const da = a[i] - ma;
      const db = b[i] - mb;
      saa += (da * da) / list.length;
      sab += (da * db) / list.length;
      sbb += (db * db) / list.length;
    }
  }
  // Teeth are never as red as the lips: a red opening is tongue and gum.
  if (la - ta < MIN_REDDER) return null;
  const det = saa * sbb - sab * sab;
  const da = la - ta;
  const db = lb - tb;
  const wa = (sbb * da - sab * db) / det;
  const wb = (saa * db - sab * da) / det;
  const gap = wa * da + wb * db;
  const apart = Math.sqrt(Math.max(0, gap));
  if (apart < MIN_APART) return null;
  return { at: (x, y) => (wa * (x - ta) + wb * (y - tb)) / gap, apart };
}

/** The pixels sure to be teeth, in pieces that hold a pixel deep inside `mouth`. Null when none does. */
function reaching(like: Float32Array, mouth: Float32Array, w: number, h: number): Float32Array | null {
  const n = w * h;
  const seen = new Uint8Array(n);
  const out = new Float32Array(n);
  let total = 0;
  for (let start = 0; start < n; start++) {
    if (seen[start] || like[start] < SURE) continue;
    const list = [start];
    seen[start] = 1;
    let deep = false;
    for (let at = 0; at < list.length; at++) {
      const i = list[at];
      if (mouth[i] >= CORE_DEPTH) deep = true;
      const x = i % w;
      for (const k of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (k < 0 || k >= n || seen[k] || like[k] < SURE) continue;
        seen[k] = 1;
        list.push(k);
      }
    }
    if (!deep) continue;
    for (const i of list) out[i] = 1;
    total += list.length;
  }
  return total >= MIN_PIXELS ? out : null;
}
