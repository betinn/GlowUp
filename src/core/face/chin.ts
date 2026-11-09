/**
 * Looks at what is under a chin, to say whether a double chin can be seen in the photo. The landmarks stop at
 * the chin, so only the photo can tell. Plain math over a list of pixels, so it can be tested alone.
 *
 * What it looks for is a fold: going down the neck from the chin, a lighter band and then a darker one, on
 * both sides of the middle at about the same height. The shadow right under a chin is not a fold, because it
 * only gets lighter on the way down. When the photo does not let it say, it answers why, and nothing is warped.
 */

import { CHIN, type ChinFold, type Face } from './scan';

export type ChinReading = { seen: true; fold: ChinFold } | { seen: false; why: string };

export const CHIN_WORDS = {
  edge: 'O queixo está perto da borda da foto, e não dá para ver o que há embaixo.',
  turned: 'O rosto está virado demais para medir embaixo do queixo.',
  covered: 'O pescoço não aparece: está coberto ou escuro demais para ler.',
  none: 'Não vi dobra embaixo do queixo nesta foto, então não há o que mexer.',
};

/** Heights looked at, with the top of the outline at 0 and the chin at 1. */
const FROM = 1;
const UNTIL = 1.5;
const STEPS = 50;
/** Half of the width looked at, as a share of the half width of the face. */
const WIDE = 0.5;
/** Below this share of pixels like skin, the neck is not there to read. */
const MIN_SKIN = 0.6;
/** A nose this far from the middle, as a share of the half width, is a head turned too far. */
const MAX_TURN = 0.42;
/** How much lighter than the fold the band above it must be, on luma 0..1, on each side. */
const MIN_DEPTH = 0.02;
/** How far from each other the fold may be on the two sides. */
const MAX_APART = 0.09;
/** Rows of smoothing over the profile. */
const SOFTEN = 2;

/** Reads a pixel of the photo, in image UV. */
export type ReadPixel = (u: number, v: number) => readonly [number, number, number];

const luma = ([r, g, b]: readonly [number, number, number]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

/** The fold in one profile: where the luma drops by enough after having risen. Null when it never does. */
function foldIn(profile: readonly (number | null)[]): number | null {
  const soft = profile.map((_, i) => {
    let sum = 0;
    let n = 0;
    for (let k = Math.max(0, i - SOFTEN); k <= Math.min(profile.length - 1, i + SOFTEN); k++) {
      const v = profile[k];
      if (v === null) continue;
      sum += v;
      n++;
    }
    return n ? sum / n : null;
  });
  let top = -1;
  let topAt = -1;
  for (let i = 0; i < soft.length; i++) {
    const v = soft[i];
    if (v === null) continue;
    if (v > top) {
      top = v;
      topAt = i;
      continue;
    }
    if (topAt < 0 || top - v < MIN_DEPTH) continue;
    // Down from the top, it now has to bottom out and come back up: a slope alone is no fold.
    let low = v;
    let lowAt = i;
    for (let k = i; k < soft.length; k++) {
      const next = soft[k];
      if (next === null) continue;
      if (next < low) {
        low = next;
        lowAt = k;
      } else if (next > low + MIN_DEPTH / 2) {
        return lowAt;
      }
    }
    return null;
  }
  return null;
}

export function readChin(face: Face, w: number, h: number, pixel: ReadPixel): ChinReading {
  const top = face.outline[0];
  const chin = face.outline[CHIN];
  const ax = (chin[0] - top[0]) * w;
  const ay = (chin[1] - top[1]) * h;
  const length = Math.hypot(ax, ay);
  const marks = face.parts.marks;
  if (!length || !marks) return { seen: false, why: CHIN_WORDS.none };
  const down = [ax / length, ay / length];
  const side = [-down[1], down[0]];
  const toPixel = (t: number, s: number): [number, number] => [(top[0] * w + down[0] * length * t + side[0] * s) / w, (top[1] * h + down[1] * length * t + side[1] * s) / h];

  // The half width comes from the corners of the jaw, on the two sides of the chin.
  const [a, b] = marks.jawCorners;
  const half = Math.hypot((a[0] - b[0]) * w, (a[1] - b[1]) * h) / 2;
  const mx = ((a[0] + b[0]) / 2 - top[0]) * w;
  const my = ((a[1] + b[1]) / 2 - top[1]) * h;
  const middle = mx * side[0] + my * side[1];
  const tipSide = (marks.noseTip[0] - top[0]) * w * side[0] + (marks.noseTip[1] - top[1]) * h * side[1];
  if (Math.abs(tipSide - middle) / half > MAX_TURN) return { seen: false, why: CHIN_WORDS.turned };

  const [lowU, lowV] = toPixel(FROM + 0.28, middle);
  if (lowU < 0 || lowU > 1 || lowV < 0 || lowV > 1) return { seen: false, why: CHIN_WORDS.edge };

  // The color of the skin, from the side of the nose, where no beard grows and the light is like the neck's.
  const [cu, cv] = marks.cheekbones[0];
  const [du, dv] = marks.cheekbones[1];
  const skin = [
    pixel(cu + (marks.noseTip[0] - cu) * 0.5, cv + (marks.noseTip[1] - cv) * 0.5),
    pixel(du + (marks.noseTip[0] - du) * 0.5, dv + (marks.noseTip[1] - dv) * 0.5),
  ];
  const ratio = ([r, g, b]: readonly [number, number, number]) => [r / Math.max(r + g + b, 1), g / Math.max(r + g + b, 1)];
  const like = (color: readonly [number, number, number]) => {
    const [p, q] = ratio(color);
    return skin.some((tone) => {
      const [tp, tq] = ratio(tone);
      return Math.hypot(p - tp, q - tq) < 0.05;
    });
  };

  const sides: (number | null)[][] = [[], []];
  let seenSkin = 0;
  let total = 0;
  for (let step = 0; step <= STEPS; step++) {
    const t = FROM + ((UNTIL - FROM) * step) / STEPS;
    for (const [n, sign] of [
      [0, -1],
      [1, 1],
    ] as const) {
      let sum = 0;
      let count = 0;
      for (let k = 1; k <= 5; k++) {
        const [u, v] = toPixel(t, middle + (sign * half * WIDE * k) / 5);
        if (u < 0 || u > 1 || v < 0 || v > 1) continue;
        const color = pixel(u, v);
        total++;
        if (!like(color)) continue;
        seenSkin++;
        sum += luma(color);
        count++;
      }
      sides[n].push(count >= 2 ? sum / count : null);
    }
  }
  if (!total || seenSkin / total < MIN_SKIN) return { seen: false, why: CHIN_WORDS.covered };
  const left = foldIn(sides[0]);
  const right = foldIn(sides[1]);
  if (left === null || right === null) return { seen: false, why: CHIN_WORDS.none };
  const span = (UNTIL - FROM) / STEPS;
  if (Math.abs(left - right) * span > MAX_APART) return { seen: false, why: CHIN_WORDS.none };
  const fold = FROM + ((left + right) / 2) * span;
  return { seen: true, fold: { from: FROM - 0.02, fold } };
}
