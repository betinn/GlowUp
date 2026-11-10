/**
 * Turns what the document asks of the shape of the faces into grids of numbers, the same way on the page and in
 * a worker. Each cell of a grid is worked out from the document alone, so a band of rows comes out the same
 * whichever thread works it and however the rows are cut: the finished field of a slider is the same, bit for
 * bit, whether it was worked out at once or in bands away from the page.
 *
 * A rough field reads the document at every few cells and fills the cells between in straight lines. It costs a
 * small share of the whole and shows where the face is going while a slider moves. The finished field always
 * follows it.
 */

import type { FaceShape } from '../doc';
import type { FunSource } from '../fun/types';
import { reshapeField, type ShapeSection } from './reshape';
import type { Face } from './scan';
import { shapeField, type ShapeField } from './shape';

/** What the document asks of the shape of the faces. */
export interface ShapeSource {
  /** Strength of the automatic mode, when it is on. */
  amount: number | undefined;
  shapes: readonly FaceShape[];
  off: readonly ShapeSection[];
  faces: readonly Face[];
  w: number;
  h: number;
}

/** What a worker works a field out from: the face menu and Liquify, or Brincar, each a field of its own. */
export type AnySource = ShapeSource | FunSource;

/** The source is of Brincar. */
export const isFun = (source: AnySource): source is FunSource => 'kind' in source && source.kind === 'fun';

/** A cell moved less than this, in UV, counts as still. */
export const STILL = 1e-6;

/** A rectangle of cells, the end excluded. */
export interface GridArea {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * What a field holds over its area, two numbers a cell, row after row, as wide as the area. `over` is the share
 * that shapes the lips and `alone` the share that moves a head alone, when a slider asks for them.
 */
export interface FieldGrids {
  area: GridArea;
  whole: Float32Array;
  over: Float32Array | null;
  alone: Float32Array | null;
}

/** Rows `y0` to `y1` of the area of a field. */
export interface FieldBand {
  y0: number;
  y1: number;
  whole: Float32Array;
  over: Float32Array | null;
  alone: Float32Array | null;
}

/** What the automatic mode and the sliders ask for together. Each one is a function of the document alone. */
export function fieldFrom({ amount, shapes, off, faces, w, h }: ShapeSource): ShapeField | null {
  const auto = amount === undefined ? null : shapeField(faces, w, h, amount / 100);
  const sliders = shapes.length ? reshapeField(faces, shapes, off, w, h) : null;
  if (!auto) return sliders;
  if (!sliders) return auto;
  return {
    over: sliders.over,
    alone: sliders.alone,
    area: {
      u0: Math.min(auto.area.u0, sliders.area.u0),
      v0: Math.min(auto.area.v0, sliders.area.v0),
      u1: Math.max(auto.area.u1, sliders.area.u1),
      v1: Math.max(auto.area.v1, sliders.area.v1),
    },
    offset(u, v) {
      const a = auto.offset(u, v);
      const b = sliders.offset(u, v);
      return [a[0] + b[0], a[1] + b[1]];
    },
  };
}

/** The cells of a grid of `w` by `h` that a field may move. */
export function gridArea(field: ShapeField, w: number, h: number): GridArea {
  const x0 = Math.max(0, Math.floor(field.area.u0 * w));
  const y0 = Math.max(0, Math.floor(field.area.v0 * h));
  const x1 = Math.min(w, Math.ceil(field.area.u1 * w));
  const y1 = Math.min(h, Math.ceil(field.area.v1 * h));
  return { x0, y0, x1: Math.max(x0, x1), y1: Math.max(y0, y1) };
}

type Offset = (u: number, v: number) => readonly [number, number];

/** The three readings of a field, in the order a band works them out. */
function readings(field: ShapeField): [Offset, Offset | null, Offset | null] {
  return [(u, v) => field.offset(u, v), field.over ? (u, v) => field.over!(u, v) : null, field.alone ? (u, v) => field.alone!(u, v) : null];
}

/** Writes one reading of a cell. A number that is not finite leaves the cell still. */
function put(out: Float32Array, i: number, du: number, dv: number): void {
  if (!Number.isFinite(du) || !Number.isFinite(dv)) return;
  out[i] = Math.abs(du) < STILL ? 0 : du;
  out[i + 1] = Math.abs(dv) < STILL ? 0 : dv;
}

/** Rows `y0` to `y1` of the area of a field, every cell read. */
export function fillRows(field: ShapeField, area: GridArea, w: number, h: number, y0: number, y1: number): FieldBand {
  const wide = area.x1 - area.x0;
  const size = Math.max(0, y1 - y0) * wide * 2;
  const [whole, over, alone] = readings(field).map((read) => {
    if (!read) return null;
    const out = new Float32Array(size);
    for (let y = y0; y < y1; y++) {
      for (let x = area.x0; x < area.x1; x++) {
        const [du, dv] = read((x + 0.5) / w, (y + 0.5) / h);
        put(out, ((y - y0) * wide + (x - area.x0)) * 2, du, dv);
      }
    }
    return out;
  });
  return { y0, y1, whole: whole!, over, alone };
}

/** The whole area of a field, every cell read. */
export function fillField(field: ShapeField, w: number, h: number): FieldGrids {
  const area = gridArea(field, w, h);
  const band = fillRows(field, area, w, h, area.y0, area.y1);
  return { area, whole: band.whole, over: band.over, alone: band.alone };
}

/** Every `step` cells from `a0`, and the last cell before `a1`. */
function lattice(a0: number, a1: number, step: number): number[] {
  const at: number[] = [];
  for (let a = a0; a < a1; a += step) at.push(a);
  if (at.length && at[at.length - 1] !== a1 - 1) at.push(a1 - 1);
  return at;
}

/**
 * The whole area of a field read at every `step` cells, and the cells between filled in straight lines. Close to
 * the finished field, for a field is smooth, at about one cell in `step * step` of the cost.
 */
export function fillRough(field: ShapeField, w: number, h: number, step: number): FieldGrids {
  const area = gridArea(field, w, h);
  const wide = area.x1 - area.x0;
  const xs = lattice(area.x0, area.x1, step);
  const ys = lattice(area.y0, area.y1, step);
  const [whole, over, alone] = readings(field).map((read) => {
    if (!read) return null;
    const out = new Float32Array((area.y1 - area.y0) * wide * 2);
    if (!xs.length || !ys.length) return out;
    // The readings at the knots, then each cell between four knots.
    const knots = new Float64Array(xs.length * ys.length * 2);
    for (let j = 0; j < ys.length; j++) {
      for (let i = 0; i < xs.length; i++) {
        const [du, dv] = read((xs[i] + 0.5) / w, (ys[j] + 0.5) / h);
        const k = (j * xs.length + i) * 2;
        knots[k] = Number.isFinite(du) ? du : 0;
        knots[k + 1] = Number.isFinite(dv) ? dv : 0;
      }
    }
    let j = 0;
    for (let y = area.y0; y < area.y1; y++) {
      while (j < ys.length - 2 && ys[j + 1] <= y) j++;
      const ty = ys.length > 1 ? (y - ys[j]) / (ys[j + 1] - ys[j]) : 0;
      const j1 = Math.min(ys.length - 1, j + 1);
      let i = 0;
      for (let x = area.x0; x < area.x1; x++) {
        while (i < xs.length - 2 && xs[i + 1] <= x) i++;
        const tx = xs.length > 1 ? (x - xs[i]) / (xs[i + 1] - xs[i]) : 0;
        const i1 = Math.min(xs.length - 1, i + 1);
        const a = (j * xs.length + i) * 2;
        const b = (j * xs.length + i1) * 2;
        const c = (j1 * xs.length + i) * 2;
        const d = (j1 * xs.length + i1) * 2;
        const o = ((y - area.y0) * wide + (x - area.x0)) * 2;
        for (let n = 0; n < 2; n++) {
          const top = knots[a + n] + (knots[b + n] - knots[a + n]) * tx;
          const bottom = knots[c + n] + (knots[d + n] - knots[c + n]) * tx;
          const v = top + (bottom - top) * ty;
          out[o + n] = Math.abs(v) < STILL ? 0 : v;
        }
      }
    }
    return out;
  });
  return { area, whole: whole!, over, alone };
}

/** Bands that cover the area of a field, in any order, put back together. */
export function joinBands(area: GridArea, bands: readonly FieldBand[]): FieldGrids {
  const wide = area.x1 - area.x0;
  const size = (area.y1 - area.y0) * wide * 2;
  const whole = new Float32Array(size);
  const hasOver = bands.some((b) => b.over);
  const hasAlone = bands.some((b) => b.alone);
  const over = hasOver ? new Float32Array(size) : null;
  const alone = hasAlone ? new Float32Array(size) : null;
  for (const b of bands) {
    const at = (b.y0 - area.y0) * wide * 2;
    whole.set(b.whole, at);
    if (over && b.over) over.set(b.over, at);
    if (alone && b.alone) alone.set(b.alone, at);
  }
  return { area, whole, over, alone };
}

/** Cuts the rows of an area into about `count` bands of rows. */
export function bandsOf(area: GridArea, count: number): [number, number][] {
  const rows = area.y1 - area.y0;
  if (rows <= 0) return [];
  const n = Math.max(1, Math.min(rows, Math.round(count)));
  const out: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    const y0 = area.y0 + Math.floor((rows * k) / n);
    const y1 = area.y0 + Math.floor((rows * (k + 1)) / n);
    if (y1 > y0) out.push([y0, y1]);
  }
  return out;
}
