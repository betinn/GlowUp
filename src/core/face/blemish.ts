/**
 * Finds the small spots on the skin that the healing brush would fix: pimples, red marks and dark
 * dots. Plain arrays and no browser APIs, so it can be tested. It only says where; the healing brush
 * then fits each spot and picks the skin to borrow, as it does for a touch.
 */

import { softBlur } from './mask';

export interface SkinSpot {
  /** Center and radius, in pixels of the grid that was searched. */
  x: number;
  y: number;
  r: number;
  /** How much it stands out from the skin around it. */
  strength: number;
}

/** Skin around a spot, as a share of the face size: wide enough to step over the largest pimple. */
const BACKGROUND = 0.03;
/** Pores and grain are this small. The search blurs them away first. */
const GRAIN = 0.0035;
/** A spot stands out by at least this much, in luma from 0 to 1 plus redness. */
const THRESHOLD = 0.035;
/** Larger than this, as a share of the face size, it is a shadow, a mole worth keeping or a feature. */
const MAX_SPOT = 0.03;
/** Spots closer than this, as a share of the face size, are one spot. */
const SPACING = 0.012;
/** A pixel must be this surely skin, and so must the ring around the spot. */
const SURE_SKIN = 0.55;
/** Redness counts more than darkness: a red mark is often as bright as the skin. */
const RED_WEIGHT = 1.6;
/** Holes this small in the skin, as a share of the face size, are closed before the search. */
const HOLE = 0.025;
/** The search stops here: a face with more is better served by Suavizar. */
export const MAX_SPOTS = 80;

/**
 * Looks for spots on one face. `rgba` holds the photo over a grid of `w` by `h`, `skin` how much each
 * pixel is skin, and `size` the face size in pixels of that grid. Returns the spots, strongest first.
 */
export function findSkinSpots(rgba: Uint8ClampedArray, given: Float32Array, w: number, h: number, size: number): SkinSpot[] {
  const n = w * h;
  // A strong spot may have left a small hole in the skin. Skin all around it closes the hole.
  const around = softBlur(given, w, h, Math.max(1, size * HOLE));
  const skin = new Float32Array(n);
  for (let i = 0; i < n; i++) skin[i] = Math.max(given[i], Math.min(1, around[i] * 1.15));
  const luma = new Float32Array(n);
  const red = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const R = rgba[i * 4] / 255;
    const G = rgba[i * 4 + 1] / 255;
    const B = rgba[i * 4 + 2] / 255;
    luma[i] = 0.2126 * R + 0.7152 * G + 0.0722 * B;
    red[i] = R - G;
  }
  // The skin around: blurred only over skin, so hair and eyes do not darken it near the edges.
  const weight = new Float32Array(n);
  const wl = new Float32Array(n);
  const wr = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    weight[i] = skin[i];
    wl[i] = luma[i] * skin[i];
    wr[i] = red[i] * skin[i];
  }
  const sigma = Math.max(2, size * BACKGROUND);
  const bw = softBlur(weight, w, h, sigma);
  const bl = softBlur(wl, w, h, sigma);
  const br = softBlur(wr, w, h, sigma);
  const deviation = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (skin[i] < 0.05 || bw[i] < 1e-3) continue;
    const l = bl[i] / bw[i];
    const r = br[i] / bw[i];
    deviation[i] = (Math.max(0, l - luma[i]) + RED_WEIGHT * Math.max(0, red[i] - r)) * skin[i];
  }
  const calm = softBlur(deviation, w, h, Math.max(0.6, size * GRAIN));

  // Local peaks, strongest first, with room between them.
  const spacing = Math.max(2, Math.round(size * SPACING));
  const peaks: number[] = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = calm[i];
      if (v < THRESHOLD || skin[i] < SURE_SKIN) continue;
      if (v < calm[i - 1] || v < calm[i + 1] || v < calm[i - w] || v < calm[i + w]) continue;
      peaks.push(i);
    }
  }
  peaks.sort((a, b) => calm[b] - calm[a]);

  const maxSpot = size * MAX_SPOT;
  const seen = new Uint8Array(n);
  const spots: SkinSpot[] = [];
  for (const peak of peaks) {
    if (spots.length >= MAX_SPOTS) break;
    const px = peak % w;
    const py = (peak / w) | 0;
    if (spots.some((s) => Math.hypot(s.x - px, s.y - py) < Math.max(spacing, s.r))) continue;
    // Grow over the pixels that stand out with the peak, and give up past the size of a spot.
    const level = Math.max(THRESHOLD * 0.6, calm[peak] * 0.4);
    const stack = [peak];
    const grown: number[] = [];
    seen[peak] = 1;
    let sx = 0;
    let sy = 0;
    let far = 0;
    let edge = false;
    while (stack.length) {
      const i = stack.pop()!;
      grown.push(i);
      const x = i % w;
      const y = (i / w) | 0;
      sx += x;
      sy += y;
      far = Math.max(far, Math.hypot(x - px, y - py));
      if (far > maxSpot) break;
      if (skin[i] < 0.35) edge = true;
      for (const j of [i - 1, i + 1, i - w, i + w]) {
        if (j < 0 || j >= n || seen[j]) continue;
        const jx = j % w;
        if (Math.abs(jx - x) > 1) continue;
        if (calm[j] >= level) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    for (const i of grown) seen[i] = 0;
    for (const i of stack) seen[i] = 0;
    if (far > maxSpot || edge) continue;
    const area = grown.length;
    // A spot fades out: cover its halo too, or it stays behind as a ring.
    const r = Math.sqrt(area / Math.PI) * 1.6 + 1.5;
    spots.push({ x: sx / area + 0.5, y: sy / area + 0.5, r, strength: calm[peak] });
  }
  return spots;
}
