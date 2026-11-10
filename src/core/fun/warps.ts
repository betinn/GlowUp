/**
 * Warps the face effects of Brincar share: an oval that grows or shrinks, a patch that slides, a face that gets
 * longer at one end, and a head that changes its proportions. Plain math, so each effect can be tested without a
 * GPU. Lengths are shares of the long side of the photo, as in `FunFace`.
 *
 * Each warp says why it never folds. The rule behind all of them: along any line, the point read moves the same
 * way as the point shown. `tests/unit/fun-effects.test.ts` checks it on a grid for every effect.
 */

import { headAlone } from '../face/reshape';
import type { FaceFrame } from '../face/shape';
import { smooth } from './kit';
import type { FunFace, FunPiece, Vec } from './types';

const unit = (x: number, y: number): Vec => {
  const n = Math.hypot(x, y) || 1;
  return [x / n, y / n];
};
const lerp = (a: Vec, b: Vec, t: number): Vec => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const gap = (a: Vec, b: Vec) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** A point of the frame of a face: `t` down the face (0 at the top of the forehead, 1 at the chin), `side` across it. */
export function fromFrame(f: FaceFrame, t: number, side: number): Vec {
  return [f.ox + f.dx * f.length * t - f.dy * side, f.oy + f.dy * f.length * t + f.dx * side];
}

/** The other way: `[t, side]` of a point. */
export function toFrame(f: FaceFrame, x: number, y: number): [number, number] {
  const rx = x - f.ox;
  const ry = y - f.oy;
  return [(rx * f.dx + ry * f.dy) / f.length, rx * -f.dy + ry * f.dx];
}

/**
 * An oval around `c`: its first half length `a` runs along `e1`, the second, `b`, across it. `back`, when given,
 * is the half length across on the other side, against the turn of `e1` (above a mouth whose `e1` points to the
 * right of the photo): an egg.
 */
export interface Oval {
  c: Vec;
  e1: Vec;
  a: number;
  b: number;
  back?: number;
}

/**
 * A point shown at `r` of the way to the edge of the oval reads the photo from `r * read(r)` on the same ray.
 * It never folds while `read(r)` stays above zero and `r * read(r)` grows with `r`, and it fades out when
 * `read(1)` is 1. That holds for an oval or an egg as for a circle: the measure grows in step with the distance
 * on every ray.
 */
function radial(o: Oval, read: (r: number) => number): FunPiece {
  const [ex, ey] = o.e1;
  const back = o.back ?? o.b;
  return {
    x: o.c[0],
    y: o.c[1],
    reach: Math.max(o.a, o.b, back),
    add(x, y, out) {
      const px = x - o.c[0];
      const py = y - o.c[1];
      const p = (px * ex + py * ey) / o.a;
      const across = -px * ey + py * ex;
      const q = across / (across < 0 ? back : o.b);
      const r2 = p * p + q * q;
      if (r2 >= 1) return;
      const k = read(Math.sqrt(r2)) - 1;
      out[0] += px * k;
      out[1] += py * k;
    },
  };
}

/**
 * Grows an oval by `scale` at its middle, the same everywhere out to `flat` of the way to its edge, so what is
 * there grows whole and keeps its shape: teeth in a mouth grow with it and never stretch. The ring out to the
 * edge takes up the difference, squeezed, and never folds: `read` rises from `1 / scale` to 1.
 */
export function zoom(o: Oval, scale: number, flat: number): FunPiece {
  const inv = 1 / Math.max(1, scale);
  return radial(o, (r) => inv + (1 - inv) * smooth(flat, 1, r));
}

/**
 * Grows an oval (`k` above 0, up to below 1) or shrinks it (`k` below 0) with the curve of `magnify`: the middle
 * shows `1 / (1 - k)` times as big. Shrinking, the ring around it stretches, and folds past `k = -1.25`, where
 * `r * read(r)` stops growing at `r² = 0.6`. Effects stay well short of it.
 */
export function bulge(o: Oval, k: number): FunPiece {
  const kk = Math.min(0.95, Math.max(-1, k));
  return radial(o, (r) => {
    const s = 1 - r * r;
    return 1 - kk * s * s;
  });
}

/**
 * Slides what is around `c` by `v`, fading to nothing at `radius`. The steepest the fade gets is about
 * `1.54 / radius`, so it never folds while `v` is shorter than `0.65 * radius`. Effects keep under 0.6.
 */
export function slide(c: Vec, v: Vec, radius: number): FunPiece {
  const most = 0.6 * radius;
  const n = Math.hypot(v[0], v[1]);
  const cut = n > most ? most / n : 1;
  const vx = v[0] * cut;
  const vy = v[1] * cut;
  return {
    x: c[0],
    y: c[1],
    reach: radius,
    add(x, y, out) {
      const dx = x - c[0];
      const dy = y - c[1];
      const s2 = (dx * dx + dy * dy) / (radius * radius);
      if (s2 >= 1) return;
      const w = (1 - s2) * (1 - s2);
      out[0] -= vx * w;
      out[1] -= vy * w;
    },
  };
}

/** Of the share of the edge on each end of a ramp, the slope eases in and out. Its steepest is `1 / (1 - EASE)` times the mean. */
const EASE = 0.2;

/** 0 before `a`, 1 after `b`, and between them a ramp with a steady slope that eases in and out. */
export function ramp(a: number, b: number, x: number): number {
  if (x <= a) return 0;
  if (x >= b) return 1;
  const t = (x - a) / (b - a);
  const m = 1 / (1 - EASE);
  if (t < EASE) return (m * t * t) / (2 * EASE);
  if (t > 1 - EASE) return 1 - (m * (1 - t) * (1 - t)) / (2 * EASE);
  return m * (t - EASE / 2);
}

/** How a face gets longer at one end. Heights are shares of the length of the face. */
export interface Lengthen {
  /** 1 to make the chin end longer, -1 for the forehead end. */
  way: 1 | -1;
  /** Where the face starts to stretch, as a height down the face. */
  from: number;
  /** The height that moves by all of `amount`: the chin, or the top of the forehead. */
  end: number;
  amount: number;
  /** Past the end, what goes along whole, and then over how much it fades out. */
  hold: number;
  fade: number;
  /** Across the face, in half widths from its middle, where the move starts to fade and where it is gone. */
  inner: number;
  outer: number;
  /** The move takes the head over the body, which stays. */
  alone?: boolean;
}

/**
 * Makes a face longer at one end. A point shown at height `t` reads from `t - amount * ramp`, so what is between
 * `from` and `end` stretches and what is past the end goes along whole, then fades back over `fade`. Across the
 * face it fades out. It never folds while `amount` times the steepest slope of the ramp stays below 1, and the
 * amount is cut so it stays below 0.75: heights are only ever moved along the face, and sideways nothing moves.
 */
export function lengthen(f: FaceFrame, l: Lengthen): FunPiece {
  const m = 1 / (1 - EASE);
  const span = Math.abs(l.end - l.from);
  // amount * m / (span + amount) <= 0.75
  const amount = Math.min(l.amount, (0.75 * span) / Math.max(1e-6, m - 0.75));
  const w = l.way;
  // In heights that grow toward the end that moves.
  const a = w * l.from;
  const t1 = w * l.end + amount;
  const t2 = t1 + l.hold;
  const t3 = t2 + l.fade;
  const middle = fromFrame(f, (w * (a + t3)) / 2, f.mid);
  const reach = Math.hypot(((t3 - a) / 2) * f.length, l.outer * f.halfWidth);
  return {
    x: middle[0],
    y: middle[1],
    reach: reach * 1.05,
    alone: l.alone ? headAlone(f) : undefined,
    add(x, y, out) {
      const [t, side] = toFrame(f, x, y);
      const tt = w * t;
      if (tt <= a || tt >= t3) return;
      const across = 1 - smooth(l.inner, l.outer, Math.abs(side - f.mid) / f.halfWidth);
      if (across <= 0) return;
      const move = -w * amount * ramp(a, t1, tt) * (1 - ramp(t2, t3, tt)) * across * f.length;
      out[0] += f.dx * move;
      out[1] += f.dy * move;
    },
  };
}

/** The neck, a little below the chin, as a height down the face: a head changes size around it. */
const PIVOT = 1.14;

/**
 * How much of the head a point is in, from 1 inside to 0 past it, as `growHead` in `kit.ts` measures it: the hair
 * goes up a face length above the forehead and out to almost two half widths. `band` is how far past the edge,
 * in those measures, it fades out: wider fades bend less steeply.
 */
function headWeight(f: FaceFrame, t: number, side: number, band: number): number {
  const sideways = Math.abs((side - f.mid) / f.halfWidth) / (1.85 + (1.05 - 1.85) * smooth(0.55, 0.95, t));
  const above = t < 0 ? -t : 0;
  return (1 - smooth(1, 1 + band, Math.hypot(sideways, above))) * (1 - smooth(1.05, 1.4, t));
}

/**
 * A map of a line onto itself that never goes back. Before `bounds[0]` and past the last bound it leaves points
 * where they are. Between two bounds a point shown reads the line at that stretch's slope, or, where the slope is
 * null, at one worked out so the two ends stay where they are. Each slope eases into the next over `soft`. All
 * slopes above zero make a map that never folds.
 */
export function lineMap(bounds: readonly number[], slopes: readonly (number | null)[], soft: number): (x: number) => number {
  const A = bounds[0] - soft;
  const B = bounds[bounds.length - 1] + soft;
  const N = 1024;
  const step = (B - A) / N;
  const H = (z: number) => smooth(-soft, soft, z);
  // The weight of each stretch at x, which add up to 1 with the two ends outside.
  const weights = (x: number) => slopes.map((_, i) => H(x - bounds[i]) - H(x - bounds[i + 1]));
  const outside = (x: number) => 1 - H(x - bounds[0]) + H(x - bounds[bounds.length - 1]);
  let fixed = 0;
  let free = 0;
  for (let k = 0; k < N; k++) {
    const x = A + (k + 0.5) * step;
    const w = weights(x);
    fixed += outside(x) * step;
    for (const [i, slope] of slopes.entries()) {
      if (slope === null) free += w[i] * step;
      else fixed += slope * w[i] * step;
    }
  }
  const freeSlope = free > 0 ? Math.max(0.05, (B - A - fixed) / free) : 1;
  const table = new Float64Array(N + 1);
  table[0] = A;
  for (let k = 0; k < N; k++) {
    const x = A + (k + 0.5) * step;
    const w = weights(x);
    let s = outside(x);
    for (const [i, slope] of slopes.entries()) s += (slope ?? freeSlope) * w[i];
    table[k + 1] = table[k] + s * step;
  }
  // Rounding leaves the far end a hair off: spread that over the line.
  const off = table[N] - B;
  return (x: number) => {
    if (x <= A || x >= B) return x;
    const at = (x - A) / step;
    const k = Math.min(N - 1, Math.floor(at));
    const v = table[k] + (table[k + 1] - table[k]) * (at - k);
    return v - (off * (x - A)) / (B - A);
  };
}

/**
 * Changes the proportions of a head with its hair: `along` times as long and `across` times as wide, around the
 * neck. Growing, the head goes over the body and the background, which stay: it is measured where it was, as
 * `growHead` does, so a point read moves out as the point shown does. Shrinking, the face shrinks inside the head
 * and the hair around it stretches to keep the outline of the head where it was, so nothing behind the head is
 * uncovered and no background has to be made up. One way, then the other, and each never folds on its own: two
 * warps that never fold make one that never folds.
 */
export function reshapeHead(f: FaceFrame, along: number, across: number): FunPiece {
  const pivot = fromFrame(f, PIVOT, f.mid);
  const L = f.length;
  const half = f.halfWidth;
  // Shrinking along the face: the face from its top to the neck shows `along` as long, and the hair above it
  // stretches down to meet it. The hair is not measured, so the stretch stops about where short hair ends: longer
  // hair stays where it is above that, and the top of shorter hair comes down only a little, which the plates fill.
  const HAIR = 0.55;
  const top = PIVOT * (1 - along);
  const shorter = along < 1 ? lineMap([-HAIR, top, PIVOT], [null, 1 / along], 0.08) : null;
  // Shrinking across: the face shows `across` as wide, and the hair beside it stretches out to about where hair
  // close to the head ends, in half widths of the face.
  const EDGE = 1.5;
  const narrower = across < 1 ? lineMap([-EDGE, -across, across, EDGE], [null, 1 / across, null], 0.1) : null;
  const scaleAxis = (t: number, side: number): number => {
    if (shorter) {
      const w = 1 - smooth(1.3, 2.2, Math.abs(side - f.mid) / half);
      return w > 0 ? t + w * (shorter(t) - t) : t;
    }
    if (along <= 1) return t;
    const tau = (t - PIVOT) * L;
    const u = tau / along;
    const wt = headWeight(f, PIVOT + u / L, side, 0.5);
    return PIVOT + (tau * (1 - (1 - 1 / along) * wt)) / L;
  };
  const scaleSide = (t: number, side: number): number => {
    const s = side - f.mid;
    if (narrower) {
      // Down to the jaw, and up over the hair, then nothing: the neck and the shoulders stay as they are.
      const w = (1 - smooth(1, 1.25, t)) * smooth(-HAIR - 0.5, -HAIR, t);
      return w > 0 ? f.mid + s + w * (narrower(s / half) * half - s) : side;
    }
    if (across <= 1) return side;
    const wt = headWeight(f, t, f.mid + s / across, 0.5);
    return f.mid + s * (1 - (1 - 1 / across) * wt);
  };
  return {
    x: pivot[0],
    y: pivot[1],
    reach: (L * (PIVOT + 1.8) + half * 3) * Math.max(1, along, across),
    alone: headAlone(f),
    add(x, y, out) {
      const [t, side] = toFrame(f, x, y);
      const t1 = scaleAxis(t, side);
      const s1 = scaleSide(t1, side);
      if (t1 === t && s1 === side) return;
      const [rx, ry] = fromFrame(f, t1, s1);
      out[0] += rx - x;
      out[1] += ry - y;
    },
  };
}

/** The mouth: its middle, which way its corners lie, half its width, its height and the top of the upper lip. Null when the face has no lips. */
export function mouthOf(read: FunFace): { c: Vec; e1: Vec; half: number; height: number; corners: [Vec, Vec]; top: Vec } | null {
  const lips = read.face.parts.outerLips;
  if (lips.length < 20) return null;
  const a = read.flat(lips[0]);
  const b = read.flat(lips[10]);
  const top = read.flat(lips[15]);
  const bottom = read.flat(lips[5]);
  const half = gap(a, b) / 2;
  if (!(half > 0)) return null;
  const c: Vec = [(a[0] + b[0] + top[0] + bottom[0]) / 4, (a[1] + b[1] + top[1] + bottom[1]) / 4];
  return { c, e1: unit(b[0] - a[0], b[1] - a[1]), half, height: gap(top, bottom), corners: [a, b], top };
}

/** The nose: its middle, which way across it, half the span of its wings, and its length from the bridge. */
export function noseOf(read: FunFace): { c: Vec; e1: Vec; half: number; length: number } | null {
  const marks = read.face.parts.marks;
  if (!marks || marks.noseWings.length < 2) return null;
  const a = read.flat(marks.noseWings[0]);
  const b = read.flat(marks.noseWings[1]);
  const bridge = read.flat(marks.bridgeMiddle);
  const base = read.flat(marks.noseBase);
  const tip = read.flat(marks.noseTip);
  const half = gap(a, b) / 2;
  const length = gap(bridge, base);
  if (!(half > 0) || !(length > 0)) return null;
  // The ball of the nose, between its tip and its wings.
  const c = lerp(tip, lerp(a, b, 0.5), 0.35);
  return { c, e1: unit(b[0] - a[0], b[1] - a[1]), half, length };
}

/** Positions in the outline of the face (see `FACE_OVAL`): the cheekbone and the corner of the jaw, on each side. */
const CHEEK_SIDES = [
  { cheekbone: 27, jaw: 24, corner: 0 },
  { cheekbone: 9, jaw: 12, corner: 1 },
] as const;

/**
 * Each cheek: its middle, between the corner of the mouth and the outline, the point of the outline beside it,
 * and the way out of the face there. Empty when the face lacks the lips or the outline.
 */
export function cheeksOf(read: FunFace): { c: Vec; edge: Vec; out: Vec }[] {
  const mouth = mouthOf(read);
  const outline = read.face.outline;
  if (!mouth || outline.length < 36) return [];
  return CHEEK_SIDES.map(({ cheekbone, jaw, corner }) => {
    const edge = lerp(read.flat(outline[cheekbone]), read.flat(outline[jaw]), 0.55);
    const c = lerp(mouth.corners[corner], edge, 0.5);
    return { c, edge, out: unit(edge[0] - c[0], edge[1] - c[1]) };
  });
}

/** The height down the face of the top of the brows, or of a little over the eyes without brows. */
export function browTop(read: FunFace): number | null {
  const f = read.frame;
  const brows = read.face.parts.brows ?? [];
  let top = Infinity;
  for (const brow of brows) for (const p of brow) top = Math.min(top, toFrame(f, ...read.flat(p))[0]);
  if (Number.isFinite(top)) return top;
  if (!f.eyes.length) return null;
  return Math.min(...f.eyes.map((e) => toFrame(f, e.x, e.y)[0])) - 0.1;
}
