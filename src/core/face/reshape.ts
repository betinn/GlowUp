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
import { faceFrame, JAW_MOVE, jawMove, type FaceFrame, type ShapeField } from './shape';

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

/** Limits, at the end of each slider. Lengths are shares of the part they act on. */
const AT_LIMIT = {
  jawline: 0.12,
  jawShape: 0.13,
  chin: 0.075,
  cheeks: 0.09,
  temples: 0.1,
  forehead: 0.075,
  length: 0.075,
  /** The head grows or shrinks by this share. */
  head: 0.09,
  eyeSize: 0.26,
  /** In radians: about six degrees. */
  eyeAngle: 0.1,
  eyeLength: 0.22,
  eyeOpen: 0.26,
  pupil: 0.6,
  brows: 0.22,
  noseWidth: 0.2,
  noseBridge: 0.24,
  noseLength: 0.1,
  noseTip: 0.07,
  mouthWidth: 0.16,
  lips: 0.26,
  mouthHeight: 0.09,
  smile: 0.11,
  /** How far the fold under the chin goes toward the chin, as a share of the way. */
  doubleChin: 0.55,
};

/** What a warp of one part of a face adds to the offset at a point. Lengths are shares of the long side. */
interface Piece {
  x: number;
  y: number;
  reach: number;
  add(x: number, y: number, out: [number, number]): void;
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
 * Grows or shrinks what is around a point, on two axes of its own. `grow` is the change at the middle, along
 * `axis` and across it. A negative one shrinks. Reading from closer to the middle is what makes it larger.
 */
function stretch(c: Vec, axis: Vec, r1: number, r2: number, grow1: number, grow2: number): Piece {
  const a = unit(axis);
  const b = across(a);
  return {
    x: c[0],
    y: c[1],
    reach: Math.max(r1, r2),
    add(x, y, out) {
      const p: Vec = [x - c[0], y - c[1]];
      const p1 = dot(p, a);
      const p2 = dot(p, b);
      const d = inside(p1, p2, r1, r2);
      if (d >= 1) return;
      const k = bump(d);
      out[0] -= (grow1 * p1 * a[0] + grow2 * p2 * b[0]) * k;
      out[1] -= (grow1 * p1 * a[1] + grow2 * p2 * b[1]) * k;
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

/** Turns what is around a point by `angle`, from `axis` toward `to`. */
function turn(c: Vec, axis: Vec, to: Vec, r1: number, r2: number, angle: number): Piece {
  const a = unit(axis);
  const b = unit(sub(to, [a[0] * dot(to, a), a[1] * dot(to, a)]));
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: c[0],
    y: c[1],
    reach: Math.max(r1, r2),
    add(x, y, out) {
      const p: Vec = [x - c[0], y - c[1]];
      const p1 = dot(p, a);
      const p2 = dot(p, b);
      const d = inside(p1, p2, r1, r2);
      if (d >= 1) return;
      const k = bump(d);
      // Reading from where the point came from: the turn backward.
      const q1 = p1 * cos + p2 * sin - p1;
      const q2 = -p1 * sin + p2 * cos - p2;
      out[0] += (q1 * a[0] + q2 * b[0]) * k;
      out[1] += (q1 * a[1] + q2 * b[1]) * k;
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
    pieces.push(
      alongAxis(f, half, 1.25, (t) => {
        if (t >= 1.4 || t <= -0.45) return 0;
        if (t >= 1) return amount * (1 - smooth(1, 1.4, t));
        if (t >= eyes) return (amount * (t - eyes)) / (1 - eyes);
        if (t >= 0) return (-amount * 0.4 * (eyes - t)) / eyes;
        return -amount * 0.4 * smooth(-0.45, 0, t);
      }),
    );
  }
  const head = value('head');
  if (head) pieces.push(headScale(f, half, head));
  const doubleChin = value('doubleChin');
  if (doubleChin && face.chin) pieces.push(chinFold(f, half, face.chin, doubleChin));
  return pieces;
}

function nosePieces({ face, flat, value }: Reading): Piece[] {
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
  if (noseWidth) pieces.push(stretch(middle(wings[0], wings[1]), sideways, wide * 2.1, long * 0.62, noseWidth, 0));
  if (noseBridge) pieces.push(stretch(flat(marks.bridgeMiddle), sideways, wide * 1.35, long * 0.62, noseBridge, 0));
  if (noseLength) pieces.push(shift(tip, scaled(axis, noseLength * long), wide * 1.7, long * 1.05, long * 0.5));
  if (noseTip) pieces.push(shift(tip, scaled(axis, -noseTip * long), wide * 1.05, long * 0.42, long * 0.42));
  return pieces;
}

function eyePieces({ face, flat, value, up }: Reading): Piece[] {
  const pieces: Piece[] = [];
  const eyeSize = value('eyeSize');
  const eyeAngle = value('eyeAngle');
  const eyeLength = value('eyeLength');
  const eyeOpen = value('eyeOpen');
  if (eyeSize || eyeAngle || eyeLength || eyeOpen) {
    for (const list of face.parts.eyes) {
      if (list.length < 9) continue;
      const eye = list.map(flat);
      const outer = eye[0];
      const inner = eye[8];
      const c = middle(outer, inner);
      const axis = unit(sub(outer, inner));
      const width = Math.hypot(outer[0] - inner[0], outer[1] - inner[1]);
      if (eyeSize) pieces.push(stretch(c, axis, width * 1.5, width * 1.35, eyeSize, eyeSize));
      if (eyeAngle) pieces.push(turn(c, axis, up, width * 1.25, width * 1.1, eyeAngle));
      if (eyeLength) pieces.push(stretch([c[0] + axis[0] * width * 0.2, c[1] + axis[1] * width * 0.2], axis, width * 1.35, width * 0.75, eyeLength, 0));
      if (eyeOpen) pieces.push(stretch(c, axis, width * 0.95, width * 0.85, 0, eyeOpen));
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
      if (!list.length || !eyeList?.length) continue;
      const brow = list.map(flat);
      const c = mean(brow);
      const wide = Math.hypot(brow[0][0] - brow[3][0], brow[0][1] - brow[3][1]);
      const eye = eyeList.map(flat);
      const gap = Math.hypot(c[0] - (eye[0][0] + eye[8][0]) / 2, c[1] - (eye[0][1] + eye[8][1]) / 2);
      pieces.push(shift(c, scaled(up, brows * gap), wide, gap * 0.7, gap * 1.1));
    }
  }
  return pieces;
}

function mouthPieces({ f, face, flat, value, up }: Reading): Piece[] {
  const { outerLips } = face.parts;
  const mouthWidth = value('mouthWidth');
  const lips = value('lips');
  const mouthHeight = value('mouthHeight');
  const smile = value('smile');
  if (!(mouthWidth || lips || mouthHeight || smile) || outerLips.length < 16) return [];
  const pieces: Piece[] = [];
  const lip = outerLips.map(flat);
  const left = lip[0];
  const right = lip[10];
  const c = middle(left, right);
  const axis = unit(sub(right, left));
  const wide = Math.hypot(right[0] - left[0], right[1] - left[1]) / 2;
  const tall = Math.hypot(lip[15][0] - lip[5][0], lip[15][1] - lip[5][1]) / 2;
  if (mouthWidth) pieces.push(stretch(c, axis, wide * 1.7, Math.max(tall * 2.4, wide * 0.8), mouthWidth, 0));
  if (lips) pieces.push(stretch(c, axis, wide * 1.2, tall * 2.5, 0, lips));
  if (mouthHeight) pieces.push(shift(c, scaled(up, mouthHeight * f.length * 0.5), wide * 1.5, tall * 3.2, tall * 3.2));
  if (smile) for (const corner of [left, right]) pieces.push(shift(corner, scaled(up, smile * wide), wide * 0.6, wide * 0.6));
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

/** A field from what the pieces of all faces add up to. */
function fieldOf(pieces: readonly Piece[], kx: number, ky: number): ShapeField {
  const area = { u0: 1, v0: 1, u1: 0, v1: 0 };
  for (const p of pieces) {
    area.u0 = Math.min(area.u0, (p.x - p.reach) / kx);
    area.v0 = Math.min(area.v0, (p.y - p.reach) / ky);
    area.u1 = Math.max(area.u1, (p.x + p.reach) / kx);
    area.v1 = Math.max(area.v1, (p.y + p.reach) / ky);
  }
  const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
  const out: [number, number] = [0, 0];
  return {
    area: { u0: clamp01(area.u0), v0: clamp01(area.v0), u1: clamp01(area.u1), v1: clamp01(area.v1) },
    offset(u, v) {
      const x = u * kx;
      const y = v * ky;
      out[0] = 0;
      out[1] = 0;
      for (const p of pieces) {
        if (Math.abs(x - p.x) > p.reach || Math.abs(y - p.y) > p.reach) continue;
        p.add(x, y, out);
      }
      if (out[0] === 0 && out[1] === 0) return [0, 0];
      // Toward an edge the read stops short of it, so what touches the edge stretches and leaves no streaks.
      const mx = out[0] < 0 ? Math.max(out[0], -x * EDGE_ROOM) : Math.min(out[0], (kx - x) * EDGE_ROOM);
      const my = out[1] < 0 ? Math.max(out[1], -y * EDGE_ROOM) : Math.min(out[1], (ky - y) * EDGE_ROOM);
      return [mx / kx, my / ky];
    },
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
