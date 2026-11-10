/**
 * The automatic Liquify: a small change to the shape of a face, worked out from its landmarks. Plain math,
 * so it can be tested without a GPU.
 *
 * Two things move. The jaw comes a little toward the middle of the face, from the cheekbones to the chin,
 * and the eyes open a little. The forehead, the nose and the mouth keep their size. Each face has its own
 * frame, so a tilted head moves along its own axes, and each side is measured from the nose, so on a
 * turned head the far side, which looks narrower, moves less.
 */

import type { Point } from './mask';
import { CHIN, type Face } from './scan';

/** A displacement in the terms of `FieldScript`: where to read the photo from, for a point in image UV. */
export interface ShapeField {
  offset(u: number, v: number): readonly [number, number];
  /**
   * The share of `offset` that shapes the lips. The lips slide over the inside of the mouth, which is read
   * without this share, so teeth are never stretched. Absent when nothing shapes the lips.
   */
  over?(u: number, v: number): readonly [number, number];
  /**
   * The share of `offset` that moves a head alone, as a change of its size does away from the neck. The body is
   * read without it, so shoulders stay where they are. Absent when head and body go together everywhere, as one
   * surface: that is what the neck does under a jaw.
   */
  alone?(u: number, v: number): readonly [number, number];
  area: { u0: number; v0: number; u1: number; v1: number };
}

/** At full strength the edge of the jaw moves this share of the half width of the face, on each side. */
export const JAW_MOVE = 0.055;
/** At full strength the middle of each eye grows this much. */
const EYE_GROW = 0.05;
/** How far past the edge of the jaw the move fades out, as a share of the half width. */
const JAW_FADE = 0.7;
/** The inside of the face moves less the closer it is to the nose, so nose and mouth keep their size. */
const JAW_INNER_POWER = 1.6;
/** Between these heights, as a share of the face from forehead to chin, the jaw move fades in. */
const JAW_FROM = [0.42, 0.7] as const;
/** And between these it fades out, into the neck. */
const JAW_UNTIL = [0.98, 1.22] as const;
/** Past this height the outline closes on the chin, and its width would no longer say the width of the jaw. */
const WIDTH_HELD_FROM = 0.86;
/**
 * A neck goes with the jaw above it: where they meet it moves as much as the jaw, and from there down it takes
 * less and less, until this share of the length of the face below the outline, where it is as wide as it was.
 * Shorter than this the neck shows a kink, and longer the collar moves with it.
 */
export const NECK_TAPER = 0.3;
/** Between these heights the taper comes in. Beside the cheeks there is no neck, and what is there goes as before. */
const NECK_FROM = [0.5, 0.78] as const;
/** The grid that holds how far below the outline a point is: its side, and the heights it covers. */
const BELOW_SIDE = 48;
const BELOW_HEIGHTS = [0.45, 1.75] as const;
/** Radius of the area around an eye that grows with it, as a share of the width of the eye. */
const EYE_REACH = 1.15;
/** Past this many radii the bell of the eye is too small to matter. */
const EYE_CUT = 2.4;
/** The move fades out this close to the edge of the photo, as a share of the long side, so the edge is not smeared. */
const EDGE_FADE = 0.03;
/** Steps of the width of the face along its height. */
const LEVELS = 64;
/** The narrower side of a turned head still counts as at least this share of the wider one. */
const MIN_SIDE = 0.25;
/**
 * On a turned head the near side looks wide, up to the whole width of the face, and a share of that would move
 * its jaw twice as far as on a face seen from the front. A real jaw seen from the side moves less, not more.
 * So a side counts for the move as no wider than this share of the length of the face, which is about the half
 * width of a face seen from the front.
 */
const SIDE_MOST = 0.38;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Looks up a table of values at heights 0..1 of the face. */
function tableAt(table: Float32Array, t: number): number {
  const at = Math.min(LEVELS - 1, Math.max(0, t * (LEVELS - 1)));
  const low = Math.floor(at);
  return lerp(table[low], table[Math.min(LEVELS - 1, low + 1)], at - low);
}

/** Sideways position along one side of the outline, per height. Heights it never reaches take the nearest. */
function sideTable(points: readonly (readonly [number, number])[]): Float32Array {
  const table = new Float32Array(LEVELS);
  const seen = new Uint8Array(LEVELS);
  for (let i = 0; i + 1 < points.length; i++) {
    const [x0, t0] = points[i];
    const [x1, t1] = points[i + 1];
    const from = Math.ceil(Math.min(t0, t1) * (LEVELS - 1));
    const to = Math.floor(Math.max(t0, t1) * (LEVELS - 1));
    for (let level = Math.max(0, from); level <= Math.min(LEVELS - 1, to); level++) {
      const t = level / (LEVELS - 1);
      const x = t1 === t0 ? x0 : lerp(x0, x1, (t - t0) / (t1 - t0));
      // Where the outline doubles back, the outermost point is the edge of the face.
      if (!seen[level] || Math.abs(x) > Math.abs(table[level])) table[level] = x;
      seen[level] = 1;
    }
  }
  const spread = (level: number, from: number) => {
    if (seen[level] || !seen[from]) return;
    table[level] = table[from];
    seen[level] = 1;
  };
  for (let level = 1; level < LEVELS; level++) spread(level, level - 1);
  for (let level = LEVELS - 2; level >= 0; level--) spread(level, level + 1);
  return table;
}

function softened(table: Float32Array): Float32Array {
  const out = new Float32Array(LEVELS);
  for (let level = 0; level < LEVELS; level++) {
    let sum = 0;
    let weight = 0;
    for (let k = -3; k <= 3; k++) {
      const at = level + k;
      if (at < 0 || at >= LEVELS) continue;
      sum += table[at];
      weight++;
    }
    out[level] = sum / weight;
  }
  return out;
}

/** Signed distance from a point to a closed outline: negative inside. */
export function distanceToOutline(x: number, y: number, points: readonly (readonly [number, number])[]): number {
  let best = Infinity;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [ax, ay] = points[j];
    const [bx, by] = points[i];
    if (ay <= y !== by <= y && x < ax + ((y - ay) / (by - ay)) * (bx - ax)) inside = !inside;
    const ex = bx - ax;
    const ey = by - ay;
    const t = Math.min(1, Math.max(0, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey || 1)));
    const d = Math.hypot(x - ax - ex * t, y - ay - ey * t);
    if (d < best) best = d;
  }
  return inside ? -best : best;
}

/** How far outside the outline of a face each point is, on a grid in the axes of the face. Zero inside. */
interface Below {
  data: Float32Array;
  /** Sideways position of the first column, and the distance between columns. */
  side0: number;
  sideStep: number;
}

/** A face, measured in its own frame. Lengths are shares of the long side of the photo. */
export interface FaceFrame {
  ox: number;
  oy: number;
  /** Down the face, from the forehead to the chin. */
  dx: number;
  dy: number;
  length: number;
  /** The nose, sideways from the axis, per height. */
  nose: Float32Array;
  /** Half width on the side of positive and of negative sideways positions, per height. */
  plus: Float32Array;
  minus: Float32Array;
  /** Radius around the frame origin outside which this face moves nothing. */
  reach: number;
  eyes: { x: number; y: number; r: number }[];
  /** Sideways position of the middle of the face, and half its width at the widest. */
  mid: number;
  halfWidth: number;
  /** How far below the outline a point is. See `neckShare`. */
  below: Below;
  /** What the move of each side is cut to, on the side of positive and of negative sideways positions. See `SIDE_MOST`. */
  most: readonly [number, number];
}

/** The grid of `Below` for an outline, out to `reach` on each side of the axis of the face. */
function belowGrid(outline: readonly (readonly [number, number])[], ox: number, oy: number, dx: number, dy: number, length: number, reach: number): Below {
  const n = BELOW_SIDE;
  const data = new Float32Array(n * n);
  const sideStep = (2 * reach) / (n - 1);
  const tStep = (BELOW_HEIGHTS[1] - BELOW_HEIGHTS[0]) / (n - 1);
  for (let row = 0; row < n; row++) {
    const along = (BELOW_HEIGHTS[0] + row * tStep) * length;
    for (let col = 0; col < n; col++) {
      const side = -reach + col * sideStep;
      data[row * n + col] = Math.max(0, distanceToOutline(ox + along * dx - side * dy, oy + along * dy + side * dx, outline));
    }
  }
  return { data, side0: -reach, sideStep };
}

/** How far below the outline of the face a point is, zero inside it. `side` and `t` are the position in the axes of the face. */
function depthBelow(f: FaceFrame, side: number, t: number): number {
  const n = BELOW_SIDE;
  const { data, side0, sideStep } = f.below;
  const col = Math.min(n - 1, Math.max(0, (side - side0) / sideStep));
  const row = Math.min(n - 1, Math.max(0, ((t - BELOW_HEIGHTS[0]) / (BELOW_HEIGHTS[1] - BELOW_HEIGHTS[0])) * (n - 1)));
  const c0 = Math.floor(col);
  const r0 = Math.floor(row);
  const c1 = Math.min(n - 1, c0 + 1);
  const r1 = Math.min(n - 1, r0 + 1);
  const top = lerp(data[r0 * n + c0], data[r0 * n + c1], col - c0);
  const bottom = lerp(data[r1 * n + c0], data[r1 * n + c1], col - c0);
  return lerp(top, bottom, row - r0);
}

/**
 * How much of a move of the outline a point takes, by how far below the outline it is: all of it on the face
 * and where the neck meets the jaw, and nothing `NECK_TAPER` further down. This is what lets a neck follow a jaw
 * and still end as wide as it was. Beside the cheeks, where there is no neck, everything takes all of it.
 */
export function neckShare(f: FaceFrame, side: number, t: number): number {
  const gate = smooth(NECK_FROM[0], NECK_FROM[1], t);
  if (gate <= 0) return 1;
  return 1 - gate * smooth(0, NECK_TAPER * f.length, depthBelow(f, side, t));
}

/**
 * How much of a move of the whole head the body under it takes: the neck all of it where it meets the jaw, and
 * nothing `NECK_TAPER` further down. Beside the cheeks, nothing: a shoulder stays where it is.
 */
export function neckFollow(f: FaceFrame, side: number, t: number): number {
  const gate = smooth(NECK_FROM[0], NECK_FROM[1], t);
  if (gate <= 0) return 0;
  return gate * (1 - smooth(0, NECK_TAPER * f.length, depthBelow(f, side, t)));
}

export function faceFrame(face: Face, kx: number, ky: number): FaceFrame | null {
  const flat = ([u, v]: Point): [number, number] => [u * kx, v * ky];
  const outline = face.outline.map(flat);
  const top = outline[0];
  const chin = outline[CHIN];
  if (!top || !chin) return null;
  const length = Math.hypot(chin[0] - top[0], chin[1] - top[1]);
  if (length <= 0) return null;
  const dx = (chin[0] - top[0]) / length;
  const dy = (chin[1] - top[1]) / length;
  const toFrame = ([x, y]: readonly [number, number]): [number, number] => {
    const rx = x - top[0];
    const ry = y - top[1];
    return [rx * -dy + ry * dx, (rx * dx + ry * dy) / length];
  };
  const a = softened(sideTable(outline.slice(0, CHIN + 1).map(toFrame)));
  const b = softened(sideTable([...outline.slice(CHIN), top].map(toFrame)));
  const midline = face.parts.midline?.map(flat).map(toFrame) ?? [];
  const nose = new Float32Array(LEVELS);
  if (midline.length) {
    nose.set(softened(sideTable(midline)));
  } else {
    for (let level = 0; level < LEVELS; level++) nose[level] = (a[level] + b[level]) / 2;
  }
  const plus = new Float32Array(LEVELS);
  const minus = new Float32Array(LEVELS);
  const held = Math.round(WIDTH_HELD_FROM * (LEVELS - 1));
  for (let level = 0; level < LEVELS; level++) {
    const at = Math.min(level, held);
    const high = Math.max(a[at], b[at]);
    const low = Math.min(a[at], b[at]);
    const middle = nose[at];
    const wider = Math.max(high - middle, middle - low, 1e-6);
    plus[level] = Math.max(high - middle, wider * MIN_SIDE);
    minus[level] = Math.max(middle - low, wider * MIN_SIDE);
    nose[level] = middle;
  }
  const eyes = face.parts.eyes
    .filter((eye) => eye.length >= 9)
    .map((list) => {
      const eye = list.map(flat);
      const sum = eye.reduce((s, p) => [s[0] + p[0], s[1] + p[1]], [0, 0]);
      const width = Math.hypot(eye[8][0] - eye[0][0], eye[8][1] - eye[0][1]);
      return { x: sum[0] / eye.length, y: sum[1] / eye.length, r: width * EYE_REACH };
    });
  const widest = Math.max(...plus, ...minus);
  const mid = nose.reduce((sum, v) => sum + v, 0) / LEVELS;
  const halfWidth = (Math.max(...plus) + Math.max(...minus)) / 2;
  const most = [Math.min(1, (length * SIDE_MOST) / Math.max(...plus)), Math.min(1, (length * SIDE_MOST) / Math.max(...minus))] as const;
  // Wide enough for whatever moves with a head, and past it the last value stands.
  const below = belowGrid(outline, top[0], top[1], dx, dy, length, Math.max(...nose.map(Math.abs)) + widest * 2.8);
  return { ox: top[0], oy: top[1], dx, dy, length, nose, plus, minus, reach: length * JAW_UNTIL[1] + widest * (1 + JAW_FADE), eyes, mid, halfWidth, below, most };
}

/** How far, in shares of the long side, to read away from a point for the jaw of this face. */
export function jawMove(f: FaceFrame, x: number, y: number, strength: number): [number, number] {
  const rx = x - f.ox;
  const ry = y - f.oy;
  const side = rx * -f.dy + ry * f.dx;
  const t = (rx * f.dx + ry * f.dy) / f.length;
  const height = smooth(JAW_FROM[0], JAW_FROM[1], t) * (1 - smooth(JAW_UNTIL[0], JAW_UNTIL[1], t));
  if (height <= 0) return [0, 0];
  const from = side - tableAt(f.nose, t);
  const half = tableAt(from >= 0 ? f.plus : f.minus, t);
  const s = Math.abs(from) / half;
  const shape = s < 1 ? s ** JAW_INNER_POWER : 1 - smooth(1, 1 + JAW_FADE, s);
  if (shape <= 0) return [0, 0];
  // Reading from further out is what brings the jaw in. The neck below goes with it, less and less.
  const move = Math.sign(from) * strength * JAW_MOVE * half * f.most[from >= 0 ? 0 : 1] * height * shape * neckShare(f, side, t);
  return [move * -f.dy, move * f.dx];
}

/**
 * The displacement for these faces, at `strength` 0..1. `w` and `h` are the size of the photo, because a
 * face is round in pixels and not in UV. On an empty field the result scales in a straight line with
 * `strength`, and that is what lets the slider preview it.
 */
export function shapeField(faces: readonly Face[], w: number, h: number, strength: number): ShapeField {
  const long = Math.max(w, h);
  const kx = w / long;
  const ky = h / long;
  const frames = faces.flatMap((face) => faceFrame(face, kx, ky) ?? []);
  const area = { u0: 1, v0: 1, u1: 0, v1: 0 };
  for (const f of frames) {
    area.u0 = Math.min(area.u0, (f.ox - f.reach) / kx);
    area.v0 = Math.min(area.v0, (f.oy - f.reach) / ky);
    area.u1 = Math.max(area.u1, (f.ox + f.reach) / kx);
    area.v1 = Math.max(area.v1, (f.oy + f.reach) / ky);
  }
  const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
  return {
    area: { u0: clamp01(area.u0), v0: clamp01(area.v0), u1: clamp01(area.u1), v1: clamp01(area.v1) },
    offset(u, v) {
      const x = u * kx;
      const y = v * ky;
      let mx = 0;
      let my = 0;
      for (const f of frames) {
        if (Math.abs(x - f.ox) > f.reach || Math.abs(y - f.oy) > f.reach) continue;
        const [jx, jy] = jawMove(f, x, y, strength);
        mx += jx;
        my += jy;
        for (const eye of f.eyes) {
          const ex = x - eye.x;
          const ey = y - eye.y;
          const d2 = (ex * ex + ey * ey) / (eye.r * eye.r);
          if (d2 > EYE_CUT * EYE_CUT) continue;
          // Reading from closer to the middle of the eye is what makes it larger.
          const grow = strength * EYE_GROW * Math.exp(-d2);
          mx -= ex * grow;
          my -= ey * grow;
        }
      }
      if (mx === 0 && my === 0) return [0, 0];
      const edge = Math.min(x, y, kx - x, ky - y);
      const fade = smooth(0, EDGE_FADE, edge);
      return [(mx * fade) / kx, (my * fade) / ky];
    },
  };
}
