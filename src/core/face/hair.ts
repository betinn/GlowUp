/**
 * Turns what the hair segmenter sees around each face into a soft limit for the brush. Plain arrays and
 * no browser APIs, so every step can be tested. Like the limits of eyes and teeth, the result lives in
 * memory for the open photo and never reaches the saved project.
 *
 * The segmenter was made for a selfie: one head filling its square input. On a group photo a pass over
 * the whole image would see tiny heads, so each face found gets its own square around the head.
 */

import { guidedFilter, type Area, type MaskTarget, type Point } from './mask';

/** Side of the square around a face, as a multiple of the face size. Hair goes past the shoulders. */
const HAIR_SPAN = 3.2;
/** The square sits this much of the face size below the face center, since long hair falls down. */
const HAIR_DROP = 0.3;
/** Confidence below the first is not hair, above the second it is. In between the edge stays soft. */
const SURE_LOW = 0.3;
const SURE_HIGH = 0.6;
/**
 * Past this confidence the refined edge may not go. Dark hair on a dark background has the same luma on
 * both sides, and there the refinement alone spread a light halo around the head.
 */
const REACH_LOW = 0.1;
const REACH_HIGH = 0.3;
/** Pixels the segmenter is this sure of tell how bright the hair is, when there are enough of them. */
const SURE_PIXEL = 0.95;
const MIN_SURE = 64;
/** Room around the brightness of the sure hair, for luma from 0 to 1, on top of twice its spread. */
const LUMA_ROOM = 0.03;
/** Reach of the refinement, as a share of the face size. */
const REFINE_RADIUS = 0.006;
const REFINE_EPS = 0.002;
/** Where longer hair stops beside a face, the cut fades over this share of the face width. */
const RAMP = 0.06;
/** A value above this, out of 255, counts as hair when framing the view. */
const FRAME_LEVEL = 128;

/** Confidence of hair over one crop, row by row, from 0 to 1. */
export interface HairCut {
  data: Float32Array;
  w: number;
  h: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Size of a face, in pixels of a grid of `w` by `h`. */
export const faceSize = (box: Area, w: number, h: number) => Math.max(box.w * w, box.h * h, 1);

/**
 * The square around one face where its hair may be, in pixels of a photo of `w` by `h`. `box` is the
 * face in image UV. Near an edge the square slides inside the photo, and it only shrinks when the
 * photo itself is smaller.
 */
export function hairCrop(box: Area, w: number, h: number): Area {
  const size = faceSize(box, w, h);
  const side = size * HAIR_SPAN;
  const sw = Math.min(side, w);
  const sh = Math.min(side, h);
  const cx = (box.x + box.w / 2) * w;
  const cy = (box.y + box.h / 2) * h + size * HAIR_DROP;
  const x = Math.round(clamp(cx - sw / 2, 0, w - sw));
  const y = Math.round(clamp(cy - sh / 2, 0, h - sh));
  return { x, y, w: Math.min(w - x, Math.round(sw)), h: Math.min(h - y, Math.round(sh)) };
}

/** Reads the cut at a point given as a share of its width and height, with bilinear blending. */
function sample(cut: HairCut, fx: number, fy: number): number {
  const x = clamp(fx * cut.w - 0.5, 0, cut.w - 1);
  const y = clamp(fy * cut.h - 0.5, 0, cut.h - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(cut.w - 1, x0 + 1);
  const y1 = Math.min(cut.h - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const at = (xx: number, yy: number) => cut.data[yy * cut.w + xx];
  const top = at(x0, y0) + (at(x1, y0) - at(x0, y0)) * tx;
  const bottom = at(x0, y1) + (at(x1, y1) - at(x0, y1)) * tx;
  return top + (bottom - top) * ty;
}

function smooth(v: number, lo: number, hi: number): number {
  const t = clamp((v - lo) / (hi - lo), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * The hair that may grow longer: all of it except, in each column that crosses a face, the hair above
 * the bottom of that face. A fringe or the top of the head would grow over the eyes, while hair beside
 * the jaw or below the chin grows freely. The cut fades over `RAMP` of the face width on each side.
 * `outlines` run around each face in image UV.
 */
export function lengthenable(hair: Uint8Array, w: number, h: number, outlines: readonly (readonly Point[])[]): Uint8Array {
  // Lowest row of a face in each column, or -1.
  const bottom = new Float32Array(w).fill(-1);
  for (const outline of outlines) {
    const grid = outline.map(([u, v]): Point => [u * w, v * h]);
    for (let i = 0, j = grid.length - 1; i < grid.length; j = i++) {
      const [ax, ay] = grid[j];
      const [bx, by] = grid[i];
      const steps = Math.max(1, Math.ceil(Math.abs(bx - ax)));
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const x = Math.floor(ax + (bx - ax) * t);
        if (x >= 0 && x < w) bottom[x] = Math.max(bottom[x], ay + (by - ay) * t);
      }
    }
  }
  let width = 0;
  for (const outline of outlines) {
    const xs = outline.map(([u]) => u * w);
    width = Math.max(width, Math.max(...xs) - Math.min(...xs));
  }
  const ramp = Math.max(1, Math.round(width * RAMP));
  const out = hair.slice();
  const span = 2 * ramp + 1;
  const isAbove = (x: number, y: number) => {
    const b = bottom[Math.min(w - 1, Math.max(0, x))];
    return b >= 0 && y < b ? 1 : 0;
  };
  for (let y = 0; y < h; y++) {
    // Share of the nearby columns where this row sits above a face, as a sliding sum.
    let above = 0;
    for (let dx = -ramp; dx <= ramp; dx++) above += isAbove(dx, y);
    for (let x = 0; x < w; x++) {
      const at = y * w + x;
      if (above && out[at]) out[at] = Math.round(out[at] * (1 - above / span));
      above += isAbove(x + ramp + 1, y) - isAbove(x - ramp, y);
    }
  }
  return out;
}

/**
 * The segmenter is unsure on parts of a head, often the shine on top. Where it is unsure, a pixel as
 * bright as the hair it is sure about, or a little darker, counts as hair too, as far as `reach` lets
 * it. Skin and a lit background are far brighter than dark hair, and the reach keeps out the rest.
 */
export function lookAlike(shape: Float32Array, reach: Float32Array, luma: Float32Array): void {
  let n = 0;
  let sum = 0;
  let squares = 0;
  for (let i = 0; i < shape.length; i++) {
    if (shape[i] < SURE_PIXEL) continue;
    n++;
    sum += luma[i];
    squares += luma[i] * luma[i];
  }
  if (n < MIN_SURE) return;
  const mean = sum / n;
  const spread = Math.sqrt(Math.max(0, squares / n - mean * mean)) * 2 + LUMA_ROOM;
  for (let i = 0; i < shape.length; i++) {
    if (shape[i] >= 1 || reach[i] <= 0) continue;
    // Shade between strands is darker than the hair around it and still hair.
    const d = (luma[i] - mean) / (luma[i] < mean ? spread * 2 : spread);
    shape[i] = Math.max(shape[i], reach[i] * Math.exp(-d * d));
  }
}

/**
 * Adds the hair of one crop to the limit. `area` is the crop in pixels of the mask grid and `size` the
 * face it belongs to, in the same pixels. Returns the corners of the hair in image UV, for the view to
 * frame, or null when the crop holds no hair.
 */
export function addHair(out: Uint8Array, target: MaskTarget, area: Area, cut: HairCut, size: number): Point[] | null {
  const a: Area = {
    x: Math.max(0, Math.floor(area.x)),
    y: Math.max(0, Math.floor(area.y)),
    w: 0,
    h: 0,
  };
  a.w = Math.min(target.w, Math.ceil(area.x + area.w)) - a.x;
  a.h = Math.min(target.h, Math.ceil(area.y + area.h)) - a.y;
  if (a.w < 2 || a.h < 2 || cut.w < 1 || cut.h < 1) return null;
  let shape: Float32Array = new Float32Array(a.w * a.h);
  const reach = new Float32Array(a.w * a.h);
  let any = false;
  for (let y = 0; y < a.h; y++) {
    const fy = (y + a.y + 0.5 - area.y) / area.h;
    for (let x = 0; x < a.w; x++) {
      const raw = sample(cut, (x + a.x + 0.5 - area.x) / area.w, fy);
      const v = smooth(raw, SURE_LOW, SURE_HIGH);
      shape[y * a.w + x] = v;
      reach[y * a.w + x] = smooth(raw, REACH_LOW, REACH_HIGH);
      if (v > 0) any = true;
    }
  }
  if (!any) return null;
  const guide = target.luma?.(a);
  if (guide) {
    lookAlike(shape, reach, guide);
    shape = guidedFilter(guide, shape, a.w, a.h, Math.max(1, Math.round(size * REFINE_RADIUS)), REFINE_EPS);
    for (let i = 0; i < shape.length; i++) shape[i] = Math.min(shape[i], reach[i]);
  }
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (let y = 0; y < a.h; y++) {
    for (let x = 0; x < a.w; x++) {
      const value = Math.round(clamp(shape[y * a.w + x], 0, 1) * 255);
      const at = (y + a.y) * target.w + x + a.x;
      if (value > out[at]) out[at] = value;
      if (value > FRAME_LEVEL) {
        box.x0 = Math.min(box.x0, x);
        box.y0 = Math.min(box.y0, y);
        box.x1 = Math.max(box.x1, x + 1);
        box.y1 = Math.max(box.y1, y + 1);
      }
    }
  }
  if (box.x1 < 0) return null;
  return [
    [(box.x0 + a.x) / target.w, (box.y0 + a.y) / target.h],
    [(box.x1 + a.x) / target.w, (box.y1 + a.y) / target.h],
  ];
}
