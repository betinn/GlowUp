/**
 * The sliders of the face menu: each one a small change to a part of a face, worked out from its landmarks.
 * Plain math, so it can be tested without a GPU. The result is always worked out from the numbers in the
 * document, never from the result before it, so moving a slider many times adds no error.
 *
 * Every slider sits at zero with no change. Positive means more of what its name says, and the limits were
 * chosen on real photos: past them the person starts to look like someone else or the warp starts to show.
 */

import type { FaceShape } from '../doc';
import type { Point } from './mask';
import { CHIN, type ChinFold, type Face } from './scan';
import { distanceToOutline, faceFrame, JAW_MOVE, jawMove, neckFollow, type FaceFrame, type ShapeField } from './shape';

export type ShapeSection = 'face' | 'eyes' | 'nose';

export interface ShapeSlider {
  id: string;
  section: ShapeSection;
  /** A heading the slider goes under, inside its section. */
  part: string;
  label: string;
  /** Sliders go from -100 to 100, or from 0 to 100 when only one way makes sense. */
  min: 0 | -100;
}

export const SHAPE_SLIDERS: readonly ShapeSlider[] = [
  { id: 'jawline', section: 'face', part: 'Contorno', label: 'Linha da mandíbula', min: -100 },
  { id: 'jawShape', section: 'face', part: 'Contorno', label: 'Forma do maxilar', min: -100 },
  { id: 'chin', section: 'face', part: 'Contorno', label: 'Queixo', min: -100 },
  { id: 'cheeks', section: 'face', part: 'Contorno', label: 'Maçãs do rosto', min: -100 },
  { id: 'temples', section: 'face', part: 'Contorno', label: 'Têmporas', min: -100 },
  { id: 'forehead', section: 'face', part: 'Altura', label: 'Testa', min: -100 },
  { id: 'length', section: 'face', part: 'Altura', label: 'Comprimento do rosto', min: -100 },
  { id: 'head', section: 'face', part: 'Cabeça', label: 'Tamanho da cabeça', min: -100 },
  { id: 'doubleChin', section: 'face', part: 'Cabeça', label: 'Papada', min: 0 },

  { id: 'eyeSize', section: 'eyes', part: 'Olhos', label: 'Tamanho', min: -100 },
  { id: 'eyeAngle', section: 'eyes', part: 'Olhos', label: 'Ângulo', min: -100 },
  { id: 'eyeLength', section: 'eyes', part: 'Olhos', label: 'Alongar', min: -100 },
  { id: 'eyeOpen', section: 'eyes', part: 'Olhos', label: 'Abrir e fechar', min: -100 },
  { id: 'pupil', section: 'eyes', part: 'Olhos', label: 'Pupilas', min: -100 },
  { id: 'brows', section: 'eyes', part: 'Sobrancelhas', label: 'Altura das sobrancelhas', min: -100 },

  { id: 'noseWidth', section: 'nose', part: 'Nariz', label: 'Largura do nariz', min: -100 },
  { id: 'noseBridge', section: 'nose', part: 'Nariz', label: 'Ponte do nariz', min: -100 },
  { id: 'noseLength', section: 'nose', part: 'Nariz', label: 'Comprimento do nariz', min: -100 },
  { id: 'noseTip', section: 'nose', part: 'Nariz', label: 'Ponta do nariz', min: -100 },
  { id: 'mouthWidth', section: 'nose', part: 'Boca', label: 'Largura da boca', min: -100 },
  { id: 'lips', section: 'nose', part: 'Boca', label: 'Volume dos lábios', min: -100 },
  { id: 'mouthHeight', section: 'nose', part: 'Boca', label: 'Altura da boca', min: -100 },
  { id: 'smile', section: 'nose', part: 'Boca', label: 'Cantos da boca', min: -100 },
];

export const sliderById = (id: string) => SHAPE_SLIDERS.find((s) => s.id === id);

/** The sliders of a face, by id. A slider left out is at zero. */
export type ShapeValues = Record<string, number>;

/**
 * Limits, at the end of each slider. Lengths are shares of the part they act on. The ones of the jaw, the chin
 * and the length of the face were measured on the real photos, as the most that leaves no step where a neck
 * with a collar close to it can no longer follow. See the decisions on the neck in `docs/DECISIONS.md`.
 */
export const AT_LIMIT = {
  jawline: 0.09,
  jawShape: 0.1,
  chin: 0.06,
  cheeks: 0.09,
  temples: 0.1,
  forehead: 0.075,
  length: 0.06,
  /** The head grows or shrinks by this share. */
  head: 0.09,
  eyeSize: 0.22,
  /** In radians: about six degrees. */
  eyeAngle: 0.1,
  eyeLength: 0.22,
  eyeOpen: 0.26,
  pupil: 0.6,
  brows: 0.16,
  noseWidth: 0.2,
  noseBridge: 0.24,
  noseLength: 0.1,
  noseTip: 0.07,
  mouthWidth: 0.16,
  lips: 0.26,
  /** A share of `MOUTH_TRAVEL`: all of it at the end of the slider. */
  mouthHeight: 1,
  smile: 0.11,
  /** How far the fold under the chin goes toward the chin, as a share of the way. */
  doubleChin: 0.55,
};

/** What a warp of one part of a face adds to the offset at a point. Lengths are shares of the long side. */
export interface Piece {
  x: number;
  y: number;
  reach: number;
  add(x: number, y: number, out: [number, number]): void;
  /**
   * The piece shapes the lips. The lips then slide over the teeth, which stay as they are: the field keeps what
   * these pieces add apart, so the inside of the mouth can be read without it.
   */
  overMouth?: boolean;
  /**
   * The piece moves a head over the body behind it, and this is the share of it the body does not take at a
   * point, from 0 to 1. Every other piece moves head and body together, as one surface, so that a neck goes
   * where its jaw goes.
   */
  alone?(x: number, y: number): number;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

type Vec = readonly [number, number];
const unit = (v: Vec): Vec => {
  const n = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / n, v[1] / n];
};
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1]];
const middle = (a: Vec, b: Vec): Vec => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
/** A quarter turn of `v`. Which way it goes is up to the caller. */
const across = (v: Vec): Vec => [-v[1], v[0]];

/** Where a point falls in a bump: its squared distance from the middle, in radii. Past 1 it moves nothing. */
const inside = (along: number, side: number, r1: number, r2: number) => (along / r1) ** 2 + (side / r2) ** 2;

/** The height of a bump, for a squared distance below 1. Zero and flat at the edge, so nothing tears. */
const bump = (d: number) => (1 - d) * (1 - d);

/**
 * Where a zone acts in full and where it stops. A point inside the inner ellipse moves by the whole amount, as
 * one rigid part, and the move fades to nothing at the outer ellipse. The outer radii can differ on each side
 * of each axis, because a nose ends at the lip and an eye ends at the brow.
 */
export interface ZoneShape {
  /** Radii of the inner ellipse, along the axis and across it. */
  in1: number;
  in2: number;
  /** Radii of the outer ellipse: against the axis and along it, then against the other axis and along it. */
  out1: readonly [number, number];
  out2: readonly [number, number];
}

/** How much of a zone a point takes: 1 in the inner ellipse, 0 past the outer one, and smooth in between. */
export function zoneWeight(p1: number, p2: number, z: ZoneShape): number {
  const inner = Math.hypot(p1 / z.in1, p2 / z.in2);
  if (inner <= 1) return 1;
  const outer = Math.hypot(p1 / (p1 < 0 ? z.out1[0] : z.out1[1]), p2 / (p2 < 0 ? z.out2[0] : z.out2[1]));
  if (outer >= 1) return 0;
  const t = (inner - 1) / (inner - 1 + (1 - outer));
  return 1 - t * t * (3 - 2 * t);
}

/**
 * A part of the face that changes as one piece, and the skin around it that takes up the difference. `source`
 * says, for a point of the part in its own axes, how far away to read it from, as if the whole plane changed.
 * `second` is the other axis, when a quarter turn of the first could point either way on the face.
 */
function zone(c: Vec, axis: Vec, shape: ZoneShape, source: (p1: number, p2: number, out: [number, number]) => void, second?: Vec): Piece {
  const a = unit(axis);
  const b = second ?? across(a);
  const from: [number, number] = [0, 0];
  return {
    x: c[0],
    y: c[1],
    reach: Math.max(shape.in1, shape.in2, shape.out1[0], shape.out1[1], shape.out2[0], shape.out2[1]),
    add(x, y, out) {
      const px = x - c[0];
      const py = y - c[1];
      const p1 = px * a[0] + py * a[1];
      const p2 = px * b[0] + py * b[1];
      const k = zoneWeight(p1, p2, shape);
      if (k <= 0) return;
      source(p1, p2, from);
      out[0] += (from[0] * a[0] + from[1] * b[0]) * k;
      out[1] += (from[0] * a[1] + from[1] * b[1]) * k;
    },
  };
}

/**
 * A zone that carries a part by `m1` and `m2` along its axes. The field says where to read from, so the part
 * that moves as one piece sits where the part ends up, not where it was. `shape` is given around the part
 * where it is now, with the outer radii at what the move must not pass, and they are kept where they are. On
 * the side the part moves to, the skin is squeezed and needs room, even if that passes the limit a little.
 */
function carried(c: Vec, axis: Vec, shape: ZoneShape, m1: number, m2: number, second?: Vec, strict = false): Piece {
  const a = unit(axis);
  const b = second ?? across(a);
  const at: Vec = [c[0] + a[0] * m1 + b[0] * m2, c[1] + a[1] * m1 + b[1] * m2];
  const sides = (out: readonly [number, number], inner: number, m: number): [number, number] => [
    Math.max(out[0] + m, strict ? 0 : inner + roomFor(Math.min(m, 0)), inner * 1.05),
    Math.max(out[1] - m, strict ? 0 : inner + roomFor(Math.max(m, 0)), inner * 1.05),
  ];
  const placed: ZoneShape = { in1: shape.in1, in2: shape.in2, out1: sides(shape.out1, shape.in1, m1), out2: sides(shape.out2, shape.in2, m2) };
  return zone(
    at,
    a,
    placed,
    (_p1, _p2, out) => {
      out[0] = -m1;
      out[1] = -m2;
    },
    b,
  );
}

/** The same, and the outer radii are a limit that nothing passes. The caller keeps the move small enough for it. */
const placed = (c: Vec, axis: Vec, shape: ZoneShape, m1: number, m2: number) => carried(c, axis, shape, m1, m2, undefined, true);

/**
 * A zone that grows a part by `s1` along its axis and `s2` across it, around the point `held` of the axis. The
 * part that changes as one piece is the part at its new size, and past it the skin gets the room it needs.
 */
function resized(c: Vec, axis: Vec, shape: ZoneShape, s1: number, s2: number, held = 0, second?: Vec): Piece {
  const reach1 = shape.in1 + Math.abs(held);
  const in1 = shape.in1 + reach1 * (s1 - 1);
  const in2 = shape.in2 * s2;
  const side = (out: number, now: number, moved: number) => Math.max(out, now + roomFor(moved), now * 1.05);
  const moved1 = reach1 * Math.abs(s1 - 1);
  const moved2 = shape.in2 * Math.abs(s2 - 1);
  const placed: ZoneShape = {
    in1,
    in2,
    out1: [side(shape.out1[0], in1, moved1), side(shape.out1[1], in1, moved1)],
    out2: [side(shape.out2[0], in2, moved2), side(shape.out2[1], in2, moved2)],
  };
  const k1 = 1 / s1 - 1;
  const k2 = 1 / s2 - 1;
  return zone(
    c,
    axis,
    placed,
    (p1, p2, out) => {
      out[0] = (p1 - held) * k1;
      out[1] = p2 * k2;
    },
    second,
  );
}

/** The outer radii of a zone grown from its inner ones by the same room on every side. */
const roomAround = (in1: number, in2: number, room: number): ZoneShape => ({
  in1,
  in2,
  out1: [in1 + room, in1 + room],
  out2: [in2 + room, in2 + room],
});

/** Room a zone needs past its inner ellipse so that the skin there is never folded, with some to spare. */
const roomFor = (move: number) => Math.abs(move) * 1.7;

/** What a piece must leave alone: 0 on a part of the face and up to `near` from it, 1 from `far` on. */
type Keep = (x: number, y: number) => number;

function keepOff(points: readonly Vec[], near: number, far: number): Keep {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of points) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return (x, y) => {
    if (x < x0 - far || x > x1 + far || y < y0 - far || y > y1 + far) return 1;
    return smooth(near, far, distanceToOutline(x, y, points));
  };
}

/** The piece, with nothing left of it on the parts of the face it has no business with. */
function guarded(piece: Piece, keeps: readonly Keep[]): Piece {
  if (!keeps.length) return piece;
  const part: [number, number] = [0, 0];
  return {
    ...piece,
    add(x, y, out) {
      part[0] = 0;
      part[1] = 0;
      piece.add(x, y, part);
      if (part[0] === 0 && part[1] === 0) return;
      let k = 1;
      for (const keep of keeps) {
        k *= keep(x, y);
        if (k <= 0) return;
      }
      out[0] += part[0] * k;
      out[1] += part[1] * k;
    },
  };
}

/** Moves what is around a point by `move`. On the side `move` points to, the bump has the radius `ahead`. */
function shift(c: Vec, move: Vec, r1: number, behind: number, ahead = behind): Piece {
  const b = unit(move);
  const a = across(b);
  return {
    x: c[0],
    y: c[1],
    reach: Math.max(r1, behind, ahead),
    add(x, y, out) {
      const p: Vec = [x - c[0], y - c[1]];
      const p2 = dot(p, b);
      const d = inside(dot(p, a), p2, r1, p2 > 0 ? ahead : behind);
      if (d >= 1) return;
      const k = bump(d);
      out[0] -= move[0] * k;
      out[1] -= move[1] * k;
    },
  };
}

/**
 * Moves everything along the axis of the face by an amount that depends only on the height, as a stretch of
 * part of the face does. `move(t)` is the amount at the height `t`, with 0 at the top of the outline and 1 at
 * the chin. Sideways the move fades past `wide` half widths of the face.
 */
function alongAxis(f: FaceFrame, half: number, wide: number, move: (t: number) => number): Piece {
  const reach = f.length * 2 + half * wide * 1.5;
  return {
    x: f.ox,
    y: f.oy,
    reach,
    add(x, y, out) {
      const rx = x - f.ox;
      const ry = y - f.oy;
      const t = (rx * f.dx + ry * f.dy) / f.length;
      const amount = move(t);
      if (amount === 0) return;
      const side = rx * -f.dy + ry * f.dx - f.mid;
      const fade = 1 - smooth(wide, wide * 1.5, Math.abs(side) / half);
      if (fade <= 0) return;
      // Reading from the other way is what moves the picture this way.
      out[0] -= amount * f.dx * fade;
      out[1] -= amount * f.dy * fade;
    },
  };
}

/**
 * The share of a move of the whole head that the body under it does not take. Hair and ears pass in front of
 * shoulders, which stay. The neck is the one part of the body that goes along, where it meets the jaw, or the
 * two would come apart there.
 */
export const headAlone = (f: FaceFrame) => (x: number, y: number) => {
  const rx = x - f.ox;
  const ry = y - f.oy;
  return 1 - neckFollow(f, rx * -f.dy + ry * f.dx, (rx * f.dx + ry * f.dy) / f.length);
};

/** Grows or shrinks a head with its hair, around a point of the neck, and fades before the shoulders. */
function headScale(f: FaceFrame, half: number, amount: number): Piece {
  const k = 1 - 1 / (1 + amount);
  // The neck, a little below the chin: a head grows away from it.
  const pivotT = 1.14;
  const px = f.ox + f.dx * f.length * pivotT - f.dy * f.mid;
  const py = f.oy + f.dy * f.length * pivotT + f.dx * f.mid;
  // How high the hair goes, as a share of the face, and how wide the head is, in half widths of the face.
  const top = 0.95;
  const sideHigh = 1.75;
  // Level with the chin only the neck goes along, or the shoulders would rise with the head.
  const sideLow = 1.05;
  const reach = f.length * 2.6 + half * 3;
  return {
    x: px,
    y: py,
    reach,
    alone: headAlone(f),
    add(x, y, out) {
      const rx = x - f.ox;
      const ry = y - f.oy;
      const t = (rx * f.dx + ry * f.dy) / f.length;
      const side = (rx * -f.dy + ry * f.dx - f.mid) / half;
      const sideways = Math.abs(side) / (sideHigh + (sideLow - sideHigh) * smooth(0.55, 0.95, t));
      const above = t < 0 ? -t / top : 0;
      const w = (1 - smooth(1, 1.45, Math.hypot(sideways, above))) * (1 - smooth(1.02, 1.38, t));
      if (w <= 0) return;
      out[0] -= (x - px) * k * w;
      out[1] -= (y - py) * k * w;
    },
  };
}

/** Grows the dark middle of an eye inside the iris, and leaves the edge of the iris where it is. */
function pupil(c: Vec, radius: number, amount: number): Piece {
  return {
    x: c[0],
    y: c[1],
    reach: radius,
    add(x, y, out) {
      const dx = x - c[0];
      const dy = y - c[1];
      const r = Math.hypot(dx, dy) / radius;
      if (r >= 1) return;
      const k = amount * (1 - r) * (1 - r);
      out[0] -= dx * k;
      out[1] -= dy * k;
    },
  };
}

/** The fold under the chin goes up toward the chin, and the neck below takes the difference. */
function chinFold(f: FaceFrame, half: number, fold: ChinFold, amount: number): Piece {
  const lift = (fold.fold - fold.from) * amount;
  const end = fold.fold + (fold.fold - fold.from) * 1.4;
  return alongAxis(f, half, 0.95, (t) => {
    if (t <= fold.from || t >= end) return 0;
    if (t < fold.fold) return (-lift * f.length * (t - fold.from)) / (fold.fold - fold.from);
    return -lift * f.length * (1 - smooth(fold.fold, end, t));
  });
}

/** What the sliders of one part of a face need to know. */
interface Reading {
  face: Face;
  f: FaceFrame;
  flat(point: Point): Vec;
  /** The number of a slider, as a share of the part it acts on, at the limit chosen for it. */
  value(id: keyof typeof AT_LIMIT): number;
  up: Vec;
}

const mean = (points: readonly Vec[]): Vec => {
  const sum = points.reduce<[number, number]>((s, p) => [s[0] + p[0], s[1] + p[1]], [0, 0]);
  return [sum[0] / points.length, sum[1] / points.length];
};

const scaled = (v: Vec, k: number): Vec => [v[0] * k, v[1] * k];

/** Moves a point of the outline away from the middle of the face. On a turned head the far side moves less. */
function outwardAt({ f, flat }: Reading, point: Point, amount: number, r1: number, r2: number): Piece {
  const p = flat(point);
  const side = (p[0] - f.ox) * -f.dy + (p[1] - f.oy) * f.dx - f.mid;
  const sign = side >= 0 ? 1 : -1;
  const k = amount * f.halfWidth * Math.min(1, Math.abs(side) / f.halfWidth);
  return shift(p, [-f.dy * sign * k, f.dx * sign * k], r1, r2);
}

function outlinePieces(r: Reading): Piece[] {
  const { f, face, flat, value } = r;
  const pieces: Piece[] = [];
  const half = f.halfWidth;
  const H = f.length;
  const jawline = value('jawline');
  if (jawline) {
    pieces.push({
      x: f.ox,
      y: f.oy,
      reach: f.reach,
      add(x, y, out) {
        // A wider jaw is the same move read the other way.
        const [jx, jy] = jawMove(f, x, y, -jawline / JAW_MOVE);
        out[0] += jx;
        out[1] += jy;
      },
    });
  }
  const { marks } = face.parts;
  if (!marks) return pieces;
  const sides: [readonly Point[], number, number, number][] = [
    [marks.jawCorners, value('jawShape'), 0.5, 0.27],
    [marks.cheekbones, value('cheeks'), 0.55, 0.26],
    [marks.temples, value('temples'), 0.55, 0.24],
  ];
  for (const [points, amount, r1, r2] of sides) {
    if (amount) for (const point of points) pieces.push(outwardAt(r, point, amount, half * r1, H * r2));
  }
  const chin = value('chin');
  if (chin) pieces.push(shift(flat(face.outline[CHIN]), [f.dx * chin * H, f.dy * chin * H], half * 0.75, H * 0.36, H * 0.16));
  return pieces;
}

function heightPieces({ f, face, value }: Reading): Piece[] {
  const pieces: Piece[] = [];
  const half = f.halfWidth;
  const H = f.length;
  const forehead = value('forehead');
  if (forehead) {
    // From the brows to the top of the outline the picture stretches, and above it the hair takes it in.
    const brow = 0.3;
    pieces.push(
      alongAxis(f, half, 1.1, (t) => {
        if (t >= brow || t <= -0.5) return 0;
        const amount = -forehead * H;
        return t > 0 ? (amount * (brow - t)) / brow : amount * smooth(-0.5, 0, t);
      }),
    );
  }
  const length = value('length');
  if (length) {
    // The line of the eyes stays. Below it the chin goes, above it the forehead goes a little.
    const eyes = 0.42;
    const amount = length * H;
    // A longer face reaches down past the chin and out past the jaw, where shoulders are: of the body, only
    // the neck goes along.
    pieces.push({
      ...alongAxis(f, half, 1.25, (t) => {
        if (t >= 1.4 || t <= -0.45) return 0;
        if (t >= 1) return amount * (1 - smooth(1, 1.4, t));
        if (t >= eyes) return (amount * (t - eyes)) / (1 - eyes);
        if (t >= 0) return (-amount * 0.4 * (eyes - t)) / eyes;
        return -amount * 0.4 * smooth(-0.45, 0, t);
      }),
      alone: headAlone(f),
    });
  }
  const head = value('head');
  if (head) pieces.push(headScale(f, half, head));
  const doubleChin = value('doubleChin');
  if (doubleChin && face.chin) pieces.push(chinFold(f, half, face.chin, doubleChin));
  return pieces;
}

/** What the sliders of one part must not move: the parts next to it, each with room that grows with the face. */
function guards({ face, flat, f }: Reading) {
  const room = f.halfWidth;
  const of = (points: readonly Point[] | undefined, near: number, far: number): Keep | null =>
    points && points.length >= 3 ? keepOff(points.map(flat), room * near, room * far) : null;
  const all = (list: readonly (Keep | null)[]): Keep[] => list.filter((keep): keep is Keep => !!keep);
  const { parts } = face;
  return {
    mouth: all([of(parts.outerLips, 0.02, 0.16)]),
    brows: (parts.brows ?? []).map((brow) => of(brow, 0.01, 0.1)),
    nose: all((parts.nostrils ?? []).map((nostril) => of(nostril, 0.02, 0.12))),
  };
}

function nosePieces(r: Reading): Piece[] {
  const { face, flat, value } = r;
  const { marks } = face.parts;
  const noseWidth = value('noseWidth');
  const noseBridge = value('noseBridge');
  const noseLength = value('noseLength');
  const noseTip = value('noseTip');
  if (!marks || !(noseWidth || noseBridge || noseLength || noseTip)) return [];
  const pieces: Piece[] = [];
  const bridge = flat(marks.bridge);
  const base = flat(marks.noseBase);
  const tip = flat(marks.noseTip);
  const wings = marks.noseWings.map(flat);
  const axis = unit(sub(base, bridge));
  const sideways = across(axis);
  const long = Math.hypot(base[0] - bridge[0], base[1] - bridge[1]);
  const wide = Math.hypot(wings[1][0] - wings[0][0], wings[1][1] - wings[0][1]) / 2;
  // The nose ends where the lip starts: below it, a zone has the skin above the lip to work with and no more.
  const lipTop = face.parts.outerLips.length >= 16 ? flat(face.parts.outerLips[15]) : null;
  const toLip = lipTop ? Math.max(long * 0.08, dot(sub(lipTop, base), axis) * 0.85) : long * 0.3;
  const keeps = guards(r).mouth;
  const low = middle(wings[0], wings[1]);
  if (noseWidth) {
    const in1 = wide * 1.12;
    const side = in1 + wide * 0.9;
    const shape: ZoneShape = { in1, in2: long * 0.3, out1: [side, side], out2: [long * 0.7, long * 0.12 + toLip] };
    pieces.push(guarded(resized(low, sideways, shape, 1 + noseWidth, 1), keeps));
  }
  if (noseBridge) {
    const in1 = wide * 0.6;
    const side = in1 + wide * 0.8;
    pieces.push(resized(flat(marks.bridgeMiddle), sideways, { in1, in2: long * 0.28, out1: [side, side], out2: [long * 0.62, long * 0.62] }, 1 + noseBridge, 1));
  }
  // Length and tip move the end of the nose along its own axis: the wings and the nostrils go as one piece.
  const end = (amount: number, inAcross: number, up: number) => {
    const move = amount * long;
    const shape: ZoneShape = { in1: long * 0.16, in2: inAcross, out1: [long * 0.16 + up, long * 0.06 + toLip], out2: [inAcross + wide * 0.8, inAcross + wide * 0.8] };
    const c: Vec = [low[0] + (tip[0] - low[0]) * 0.5, low[1] + (tip[1] - low[1]) * 0.5];
    return guarded(carried(c, axis, shape, move, 0), keeps);
  };
  if (noseLength) pieces.push(end(noseLength, wide * 1.1, long * 0.85));
  if (noseTip) pieces.push(end(-noseTip, wide * 0.55, long * 0.4));
  return pieces;
}

/** An eye in its own axes: the middle between the corners, the axis from the inner corner out, and how tall it is. */
function eyeFrame(list: readonly Vec[]) {
  const outer = list[0];
  const inner = list[8];
  const c = middle(outer, inner);
  const axis = unit(sub(outer, inner));
  const b = across(axis);
  const width = Math.hypot(outer[0] - inner[0], outer[1] - inner[1]);
  let tall = 0;
  for (const p of list) tall = Math.max(tall, Math.abs(dot(sub(p, c), b)));
  // A closed eye still has lids and lashes around the line.
  return { c, axis, b, width, half: width / 2, tall: Math.max(tall, width * 0.14) };
}

function eyePieces(r: Reading): Piece[] {
  const { face, flat, value, up } = r;
  const pieces: Piece[] = [];
  const eyeSize = value('eyeSize');
  const eyeAngle = value('eyeAngle');
  const eyeLength = value('eyeLength');
  const eyeOpen = value('eyeOpen');
  const keep = guards(r);
  if (eyeSize || eyeAngle || eyeLength || eyeOpen) {
    for (const [i, list] of face.parts.eyes.entries()) {
      if (list.length < 9) continue;
      const { c, axis, b, width, half, tall } = eyeFrame(list.map(flat));
      // The eye itself, with its lids and lashes: what changes as one piece.
      const in1 = half * 1.14;
      const in2 = tall * 1.35 + width * 0.03;
      // Toward the brow the skin of the lid takes up the change, and it stops short of the brow.
      const brow = face.parts.brows?.[i]?.map(flat);
      let toBrow = in2 + width * 0.3;
      if (brow?.length) {
        let nearest = Infinity;
        for (const p of brow) nearest = Math.min(nearest, Math.abs(dot(sub(p, c), b)));
        toBrow = Math.max(in2 * 1.25, nearest * 0.9);
      }
      // `b` points to one side of the eye. Which side the brow is on depends on the eye.
      const browSide = dot(b, up) > 0;
      const cheek = in2 + width * 0.3;
      const shape: ZoneShape = { in1, in2, out1: [in1 + width * 0.2, in1 + width * 0.26], out2: browSide ? [cheek, toBrow] : [toBrow, cheek] };
      const browKeep = keep.brows[i];
      const guard = [...(browKeep ? [browKeep] : []), ...keep.nose];
      if (eyeSize) pieces.push(guarded(resized(c, axis, shape, 1 + eyeSize, 1 + eyeSize), guard));
      if (eyeAngle) {
        // Positive lifts the outer corner. Reading from where the point came from: the turn backward.
        const turn = (browSide ? 1 : -1) * eyeAngle;
        const cos = Math.cos(turn);
        const sin = Math.sin(turn);
        pieces.push(
          guarded(
            zone(c, axis, shape, (p1, p2, out) => {
              out[0] = p1 * cos + p2 * sin - p1;
              out[1] = -p1 * sin + p2 * cos - p2;
            }),
            guard,
          ),
        );
      }
      if (eyeLength) {
        // The inner corner holds and the outer one goes.
        pieces.push(guarded(resized(c, axis, shape, 1 + eyeLength, 1, -half * 0.7), guard));
      }
      if (eyeOpen) pieces.push(guarded(resized(c, axis, shape, 1, 1 + eyeOpen), guard));
    }
  }
  const pupils = value('pupil');
  if (pupils) {
    for (const list of face.parts.irises) {
      if (!list.length) continue;
      const ring = list.map(flat);
      const c = mean(ring);
      pieces.push(pupil(c, ring.reduce((s, p) => s + Math.hypot(p[0] - c[0], p[1] - c[1]), 0) / ring.length, pupils));
    }
  }
  const brows = value('brows');
  if (brows && face.parts.brows) {
    for (const [i, list] of face.parts.brows.entries()) {
      const eyeList = face.parts.eyes[i];
      if (list.length < 10 || !eyeList?.length) continue;
      const brow = list.map(flat);
      const c = mean(brow);
      // The two ends of the brow, and how thick it is.
      const axis = unit(sub(brow[4], brow[0]));
      const b = across(axis);
      const half = Math.hypot(brow[4][0] - brow[0][0], brow[4][1] - brow[0][1]) / 2;
      let thick = 0;
      for (const p of brow) thick = Math.max(thick, Math.abs(dot(sub(p, c), b)));
      const eye = eyeList.map(flat);
      const gap = Math.hypot(c[0] - (eye[0][0] + eye[8][0]) / 2, c[1] - (eye[0][1] + eye[8][1]) / 2);
      const move = scaled(up, brows * gap);
      const in1 = half * 1.15;
      const in2 = thick * 1.45;
      // Above the brow the forehead has room. Below it the move ends at the lashes, so the eye stays where it
      // is, and the whole lid shares the change: a guard around the eye would squeeze it all into the crease.
      const above = in2 + gap * 0.95;
      let lashes = Infinity;
      for (const p of eye) lashes = Math.min(lashes, Math.abs(dot(sub(p, c), b)));
      const below = Math.max(in2 * 1.2, lashes * 0.96);
      const browSide = dot(b, up) > 0;
      const shape: ZoneShape = { in1, in2, out1: [in1 + half * 0.5, in1 + half * 0.5], out2: browSide ? [below, above] : [above, below] };
      pieces.push(placed(c, axis, shape, dot(move, axis), dot(move, b)));
    }
  }
  return pieces;
}

/** How far the mouth goes up or down at the end of its slider, as a share of the skin between nose and lip. */
const MOUTH_TRAVEL = 0.34;
/** Samples of the lip lines across the mouth. */
const LIP_STEPS = 48;

/** The height of a line of lip at each step across the mouth, in the axes of the mouth. */
function lipLine(points: readonly Vec[], c: Vec, a: Vec, b: Vec, wide: number): Float32Array {
  const flatPoints = points.map((p) => [dot(sub(p, c), a), dot(sub(p, c), b)] as const).sort((p, q) => p[0] - q[0]);
  const out = new Float32Array(LIP_STEPS + 1);
  let at = 0;
  for (let i = 0; i <= LIP_STEPS; i++) {
    const x = (i / LIP_STEPS) * 2 * wide - wide;
    while (at + 2 < flatPoints.length && flatPoints[at + 1][0] < x) at++;
    const [x0, y0] = flatPoints[at];
    const [x1, y1] = flatPoints[Math.min(flatPoints.length - 1, at + 1)];
    const t = x1 === x0 ? 0 : Math.min(1, Math.max(0, (x - x0) / (x1 - x0)));
    out[i] = y0 + (y1 - y0) * t;
  }
  return out;
}

const lineAt = (line: Float32Array, x: number, wide: number) => {
  const at = Math.min(LIP_STEPS, Math.max(0, ((x + wide) / (2 * wide)) * LIP_STEPS));
  const low = Math.floor(at);
  return line[low] + (line[Math.min(LIP_STEPS, low + 1)] - line[low]) * (at - low);
};

interface LipLines {
  upOut: Float32Array;
  upIn: Float32Array;
  lowIn: Float32Array;
  lowOut: Float32Array;
}

/**
 * Fuller or thinner lips. Each lip grows from the line where it meets the opening of the mouth, which stays
 * where it is, so nothing inside the mouth moves. The skin past the lip takes up the difference. `b` points
 * down the face.
 */
function lipVolume(c: Vec, a: Vec, b: Vec, wide: number, lines: LipLines, grow: number, roomUp: number, roomDown: number): Piece {
  let tallest = 0;
  for (let i = 0; i <= LIP_STEPS; i++) tallest = Math.max(tallest, -lines.upOut[i], lines.lowOut[i]);
  const reach = Math.max(wide, tallest * (1 + Math.abs(grow)) + Math.max(roomUp, roomDown)) * 1.05;
  return {
    x: c[0],
    y: c[1],
    reach,
    overMouth: true,
    add(x, y, out) {
      const px = x - c[0];
      const py = y - c[1];
      const p1 = px * a[0] + py * a[1];
      if (Math.abs(p1) >= wide) return;
      const p2 = px * b[0] + py * b[1];
      const inUp = lineAt(lines.upIn, p1, wide);
      const inLow = lineAt(lines.lowIn, p1, wide);
      const upper = p2 < (inUp + inLow) / 2;
      // Distance from the opening, and the thickness of the lip on this side, at this step across the mouth.
      const t = upper ? inUp - p2 : p2 - inLow;
      if (t <= 0) return;
      const thick = Math.max(0, upper ? inUp - lineAt(lines.upOut, p1, wide) : lineAt(lines.lowOut, p1, wide) - inLow);
      if (thick <= 0) return;
      const edge = thick * (1 + grow);
      const room = Math.max(upper ? roomUp : roomDown, roomFor(thick * grow));
      let move: number;
      if (t <= edge) move = (t * grow) / (1 + grow);
      else if (t < edge + room) move = thick * grow * (1 - smooth(0, 1, (t - edge) / room));
      else return;
      // Reading from nearer the opening is what makes a lip larger: an upper lip reads from below.
      const k = upper ? move : -move;
      out[0] += b[0] * k;
      out[1] += b[1] * k;
    },
  };
}

function mouthPieces(r: Reading): Piece[] {
  const { face, flat, value, up } = r;
  const { outerLips, innerLips } = face.parts;
  const mouthWidth = value('mouthWidth');
  const lips = value('lips');
  const mouthHeight = value('mouthHeight');
  const smile = value('smile');
  if (!(mouthWidth || lips || mouthHeight || smile) || outerLips.length < 20) return [];
  const pieces: Piece[] = [];
  const lip = outerLips.map(flat);
  const left = lip[0];
  const right = lip[10];
  const c = middle(left, right);
  const axis = unit(sub(right, left));
  // Down the face, whichever corner the list starts at.
  const turned = across(axis);
  const b: Vec = dot(turned, up) < 0 ? turned : [-turned[0], -turned[1]];
  const wide = Math.hypot(right[0] - left[0], right[1] - left[1]) / 2;
  const tall = Math.max(Math.abs(dot(sub(lip[15], c), b)), Math.abs(dot(sub(lip[5], c), b)), wide * 0.12);
  const { marks } = face.parts;
  // The skin between the nose and the lip, and between the lip and the chin: what a mouth can move into.
  const toNose = marks ? Math.max(wide * 0.2, Math.abs(dot(sub(flat(marks.noseBase), c), b)) - tall) : wide * 0.6;
  const toChin = Math.max(wide * 0.3, Math.abs(dot(sub(flat(face.outline[CHIN]), c), b)) - tall);
  const keep = guards(r).nose;
  const upRoom = toNose * 0.95;
  const downRoom = toChin * 0.8;
  // The zones here have `b` as their second axis: the side against it is toward the nose.
  if (mouthHeight) {
    // The whole mouth goes as one piece, lips and teeth, and the skin above and below takes up the difference.
    const move = mouthHeight * MOUTH_TRAVEL * toNose;
    const in1 = wide * 1.12;
    const in2 = tall * 1.12;
    const shape: ZoneShape = { in1, in2, out1: [in1 + wide * 0.7, in1 + wide * 0.7], out2: [in2 + upRoom, in2 + downRoom] };
    pieces.push(guarded(carried(c, axis, shape, 0, -move, b), keep));
  }
  if (mouthWidth) {
    const in1 = wide * 1.06;
    const in2 = tall * 1.15;
    const side = in1 + wide * 0.7;
    const shape: ZoneShape = { in1, in2, out1: [side, side], out2: [in2 + upRoom * 0.8, in2 + Math.min(downRoom, wide * 0.7)] };
    pieces.push({ ...guarded(resized(c, axis, shape, 1 + mouthWidth, 1, 0, b), keep), overMouth: true });
  }
  if (lips && innerLips.length >= 20) {
    const inner = innerLips.map(flat);
    const lines: LipLines = {
      upOut: lipLine([lip[10], ...lip.slice(11), lip[0]], c, axis, b, wide),
      upIn: lipLine([inner[10], ...inner.slice(11), inner[0]], c, axis, b, wide),
      lowIn: lipLine(inner.slice(0, 11), c, axis, b, wide),
      lowOut: lipLine(lip.slice(0, 11), c, axis, b, wide),
    };
    pieces.push(guarded(lipVolume(c, axis, b, wide, lines, lips, upRoom * 0.85, downRoom * 0.7), keep));
  }
  if (smile) {
    const move = smile * wide;
    const in1 = wide * 0.16;
    const shape = roomAround(in1, in1, wide * 0.42);
    for (const corner of [left, right]) pieces.push({ ...carried(corner, axis, shape, 0, -move, b), overMouth: true });
  }
  return pieces;
}

/** All the pieces of one face at the numbers it has, in shares of the long side. */
function piecesOf(face: Face, values: ShapeValues, kx: number, ky: number): Piece[] {
  const f = faceFrame(face, kx, ky);
  if (!f) return [];
  const reading: Reading = {
    face,
    f,
    flat: ([u, v]) => [u * kx, v * ky],
    value: (id) => ((values[id] ?? 0) / 100) * AT_LIMIT[id],
    up: [-f.dx, -f.dy],
  };
  return [...outlinePieces(reading), ...heightPieces(reading), ...nosePieces(reading), ...eyePieces(reading), ...mouthPieces(reading)];
}

/** Of the way to the edge of the photo, the share a point may read. Past the edge the photo has nothing to show. */
const EDGE_ROOM = 0.6;

/** A field from what the pieces of all faces add up to. Brincar adds its own pieces up the same way, in a field of its own. */
export function fieldOf(pieces: readonly Piece[], kx: number, ky: number): ShapeField {
  const area = { u0: 1, v0: 1, u1: 0, v1: 0 };
  for (const p of pieces) {
    area.u0 = Math.min(area.u0, (p.x - p.reach) / kx);
    area.v0 = Math.min(area.v0, (p.y - p.reach) / ky);
    area.u1 = Math.max(area.u1, (p.x + p.reach) / kx);
    area.v1 = Math.max(area.v1, (p.y + p.reach) / ky);
  }
  const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
  const out: [number, number] = [0, 0];
  const lips = pieces.filter((p) => p.overMouth);
  const alone = pieces.filter((p) => p.alone);
  const sum = (list: readonly Piece[], x: number, y: number) => {
    out[0] = 0;
    out[1] = 0;
    for (const p of list) {
      if (Math.abs(x - p.x) > p.reach || Math.abs(y - p.y) > p.reach) continue;
      p.add(x, y, out);
    }
  };
  // Toward an edge the read stops short of it, so what touches the edge stretches and leaves no streaks.
  const short = (move: number, at: number, side: number) => (move < 0 ? Math.max(move, -at * EDGE_ROOM) : Math.min(move, (side - at) * EDGE_ROOM));
  const part: [number, number] = [0, 0];
  return {
    area: { u0: clamp01(area.u0), v0: clamp01(area.v0), u1: clamp01(area.u1), v1: clamp01(area.v1) },
    offset(u, v) {
      const x = u * kx;
      const y = v * ky;
      sum(pieces, x, y);
      if (out[0] === 0 && out[1] === 0) return [0, 0];
      return [short(out[0], x, kx) / kx, short(out[1], y, ky) / ky];
    },
    over: lips.length
      ? (u, v) => {
          sum(lips, u * kx, v * ky);
          return [out[0] / kx, out[1] / ky];
        }
      : undefined,
    alone: alone.length
      ? (u, v) => {
          const x = u * kx;
          const y = v * ky;
          let ax = 0;
          let ay = 0;
          for (const p of alone) {
            if (Math.abs(x - p.x) > p.reach || Math.abs(y - p.y) > p.reach) continue;
            part[0] = 0;
            part[1] = 0;
            p.add(x, y, part);
            if (part[0] === 0 && part[1] === 0) continue;
            const k = p.alone!(x, y);
            ax += part[0] * k;
            ay += part[1] * k;
          }
          if (ax === 0 && ay === 0) return [0, 0];
          // Cut short by as much as the whole was, so the body never reads past where the head does.
          sum(pieces, x, y);
          const cx = out[0] === 0 ? 1 : short(out[0], x, kx) / out[0];
          const cy = out[1] === 0 ? 1 : short(out[1], y, ky) / out[1];
          return [(ax * cx) / kx, (ay * cy) / ky];
        }
      : undefined,
  };
}

/** The face of the list a saved number belongs to: the one nearest to where it was, if it holds that place. */
export function faceAt(faces: readonly Face[], at: readonly [number, number]): Face | null {
  let best: Face | null = null;
  let distance = Infinity;
  for (const face of faces) {
    const { x, y, w, h } = face.box;
    const d = Math.hypot(x + w / 2 - at[0], y + h / 2 - at[1]);
    if (d < distance && d < Math.max(w, h) * 0.6) {
      distance = d;
      best = face;
    }
  }
  return best;
}

export const hasValues = (values: ShapeValues) => Object.values(values).some((v) => v !== 0);

/**
 * The field of all the sliders of all the faces. Sections in `off` count as zero. `w` and `h` are the size of
 * the photo, because a face is round in pixels and not in UV.
 */
export function reshapeField(faces: readonly Face[], shapes: readonly FaceShape[], off: readonly ShapeSection[], w: number, h: number): ShapeField {
  const long = Math.max(w, h);
  const kx = w / long;
  const ky = h / long;
  const pieces: Piece[] = [];
  for (const shape of shapes) {
    const face = faceAt(faces, shape.at);
    if (!face) continue;
    const values: ShapeValues = {};
    for (const [id, v] of Object.entries(shape.values)) {
      const meta = sliderById(id);
      if (meta && !off.includes(meta.section)) values[id] = v;
    }
    pieces.push(...piecesOf(face, values, kx, ky));
  }
  return fieldOf(pieces, kx, ky);
}
