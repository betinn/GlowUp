import type { FieldController, ShapeSource } from '../../core/engine';
import { reshapeField } from '../../core/face/reshape';
import { shapeField, type ShapeField } from '../../core/face/shape';
import type { GLContext, Tex } from '../../core/gl/context';
import type { HistoryEntry } from '../../core/history/history';
import { DisplacementGrid, strokeTo, type GridTile, type LiquifyMode } from './grid';

const GRID_SIDE = 1024;

/** A cell moved less than this, in UV, counts as still. */
const STILL = 1e-6;

/** What the automatic mode and the sliders ask for together. Each one is a function of the document alone. */
function fieldFrom({ amount, shapes, off, faces, w, h }: ShapeSource): ShapeField | null {
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

/**
 * Connects the displacement of the photo to its RG16F texture, which the develop shader samples to warp the
 * image. Two things make it up. The brush is a grid that keeps what the strokes did, and what the document
 * asks for (the automatic mode and the sliders) is worked out anew each time, so moving a slider adds no error.
 * The strokes were made on what the screen showed, so they go on top: a point reads the brush, then the shape.
 *
 * Three more textures say what part of that is whose, for the layers of the develop stage. The brush alone is
 * what may move a background. The share of the sliders that moves a head alone is what a body is read without,
 * so shoulders stay under a head that changes size, and with every other slider the body goes where the head
 * goes, as a neck does under a jaw. The share that shapes the lips is what the inside of a mouth is read
 * without, so lips slide over teeth.
 */
export function createField(glc: GLContext, imageW: number, imageH: number): FieldController {
  const long = Math.max(imageW, imageH);
  const w = Math.max(2, Math.round((imageW / long) * GRID_SIDE));
  const h = Math.max(2, Math.round((imageH / long) * GRID_SIDE));
  const grid = new DisplacementGrid(w, h);
  /** What the sliders and the automatic mode ask for, in the same terms. Null when nothing. */
  let shape: DisplacementGrid | null = null;
  /** Where it holds something. */
  let shapeArea = { x0: 0, y0: 0, x1: 0, y1: 0 };
  /** Both together, as the screen and the export read them. */
  const whole = new DisplacementGrid(w, h);
  const tex: Tex = glc.createTex(w, h, 'rg16f', { noTarget: true });
  glc.upload(tex, { x: 0, y: 0, w, h }, whole.data);
  /** The brush alone. */
  const brushTex: Tex = glc.createTex(w, h, 'rg16f', { noTarget: true });
  glc.upload(brushTex, { x: 0, y: 0, w, h }, grid.data);
  /** A share of `shape`, the same as the screen reads it, and its texture. The last two exist while a slider asks for that share. */
  interface Share {
    asked: DisplacementGrid | null;
    read: DisplacementGrid | null;
    tex: Tex | null;
  }
  /** The share that shapes the lips, and the share that moves a head alone. */
  const lips: Share = { asked: null, read: null, tex: null };
  const head: Share = { asked: null, read: null, tex: null };

  let mode: LiquifyMode = 'push';
  let radius = 0;
  let strength = 0;
  let last: [number, number] | null = null;

  /** Works out one area of `whole` and sends it to the GPU. */
  const compose = (x0: number, y0: number, x1: number, y1: number) => {
    const m = grid.data;
    const out = whole.data;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * w + x) * 2;
        const du = m[i];
        const dv = m[i + 1];
        if (!shape) {
          out[i] = du;
          out[i + 1] = dv;
          continue;
        }
        if (du === 0 && dv === 0) {
          out[i] = shape.data[i];
          out[i + 1] = shape.data[i + 1];
          continue;
        }
        const [su, sv] = shape.sample((x + 0.5) / w + du, (y + 0.5) / h + dv);
        out[i] = du + su;
        out[i + 1] = dv + sv;
      }
    }
    const rect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    if (rect.w <= 0 || rect.h <= 0) return;
    glc.upload(tex, rect, out.subarray((y0 * w + x0) * 2), w);
    glc.upload(brushTex, rect, m.subarray((y0 * w + x0) * 2), w);
    for (const share of [lips, head]) {
      const { asked } = share;
      if (!asked) {
        if (share.tex) glc.destroyTex(share.tex);
        share.tex = null;
        share.read = null;
        continue;
      }
      const fresh = !share.read || !share.tex;
      share.read ??= new DisplacementGrid(w, h);
      share.tex ??= glc.createTex(w, h, 'rg16f', { noTarget: true });
      const to = share.read.data;
      const a = fresh ? { x0: 0, y0: 0, x1: w, y1: h } : { x0, y0, x1, y1 };
      for (let y = a.y0; y < a.y1; y++) {
        for (let x = a.x0; x < a.x1; x++) {
          const i = (y * w + x) * 2;
          const du = m[i];
          const dv = m[i + 1];
          if (du === 0 && dv === 0) {
            to[i] = asked.data[i];
            to[i + 1] = asked.data[i + 1];
            continue;
          }
          const [su, sv] = asked.sample((x + 0.5) / w + du, (y + 0.5) / h + dv);
          to[i] = su;
          to[i + 1] = sv;
        }
      }
      glc.upload(share.tex, { x: a.x0, y: a.y0, w: a.x1 - a.x0, h: a.y1 - a.y0 }, to.subarray((a.y0 * w + a.x0) * 2), w);
    }
  };

  /** Writes a field of the document into a grid, over `area`, and clears what it held in `before`. */
  const fill = (data: Float32Array, before: typeof shapeArea, area: typeof shapeArea, offset: (u: number, v: number) => readonly [number, number]) => {
    for (let y = before.y0; y < before.y1; y++) data.fill(0, (y * w + before.x0) * 2, (y * w + before.x1) * 2);
    for (let y = area.y0; y < area.y1; y++) {
      for (let x = area.x0; x < area.x1; x++) {
        const [du, dv] = offset((x + 0.5) / w, (y + 0.5) / h);
        if (!Number.isFinite(du) || !Number.isFinite(dv)) continue;
        const i = (y * w + x) * 2;
        data[i] = Math.abs(du) < STILL ? 0 : du;
        data[i + 1] = Math.abs(dv) < STILL ? 0 : dv;
      }
    }
  };

  const flush = () => {
    const d = grid.takeDirty();
    if (d) compose(d.x, d.y, d.x + d.w, d.y + d.h);
  };

  /** Closes what changed since the last call into one undo step. */
  const step = (label: string): HistoryEntry | null => {
    let tiles: GridTile[] = grid.takeSnapshot();
    if (!tiles.length) return null;
    const swap = () => {
      tiles = grid.swap(tiles);
      flush();
    };
    return {
      label,
      bytes: tiles.reduce((n, t) => n + t.data.byteLength + 48, 0),
      undo: swap,
      redo: swap,
    };
  };

  return {
    tex,
    brushTex,
    get lipTex() {
      return lips.tex;
    },
    get headTex() {
      return head.tex;
    },
    lookup: (u, v) => whole.sample(u, v),

    begin(nextMode, size, nextStrength) {
      mode = nextMode as LiquifyMode;
      radius = size * Math.max(w, h);
      strength = nextStrength;
      last = null;
    },

    stroke(u, v) {
      last = strokeTo(grid, mode, radius, strength, last, u * w, v * h);
      flush();
    },

    end: () => step('Liquify'),

    apply(script, label) {
      if ('strokes' in script) {
        for (const s of script.strokes) {
          let from: [number, number] | null = null;
          for (const [u, v] of s.path) {
            from = strokeTo(grid, s.mode as LiquifyMode, s.radius * Math.max(w, h), s.strength, from, u * w, v * h);
          }
        }
      } else {
        grid.displace(script.offset, script.area);
      }
      flush();
      return step(label);
    },

    isEmpty: () => grid.isEmpty() && (!shape || shape.isEmpty()),
    brushEmpty: () => grid.isEmpty(),
    serialize: () => grid.data,

    restore(data) {
      grid.data.set(data);
      compose(0, 0, w, h);
    },

    setShape(source) {
      const next = source ? fieldFrom(source) : null;
      if (!next) {
        if (!shape) return;
        shape = null;
        lips.asked = null;
        head.asked = null;
        compose(shapeArea.x0, shapeArea.y0, shapeArea.x1, shapeArea.y1);
        shapeArea = { x0: 0, y0: 0, x1: 0, y1: 0 };
        return;
      }
      shape ??= new DisplacementGrid(w, h);
      const before = shapeArea;
      const x0 = Math.max(0, Math.floor(next.area.u0 * w));
      const y0 = Math.max(0, Math.floor(next.area.v0 * h));
      const x1 = Math.min(w, Math.ceil(next.area.u1 * w));
      const y1 = Math.min(h, Math.ceil(next.area.v1 * h));
      shapeArea = { x0, y0, x1: Math.max(x0, x1), y1: Math.max(y0, y1) };
      fill(shape.data, before, shapeArea, (u, v) => next.offset(u, v));
      for (const [share, of] of [[lips, next.over], [head, next.alone]] as const) {
        if (of) {
          share.asked ??= new DisplacementGrid(w, h);
          fill(share.asked.data, before, shapeArea, (u, v) => of(u, v));
        } else {
          share.asked = null;
        }
      }
      const has = before.x1 > before.x0 && before.y1 > before.y0;
      const a = has ? before : shapeArea;
      compose(Math.min(a.x0, shapeArea.x0), Math.min(a.y0, shapeArea.y0), Math.max(a.x1, shapeArea.x1), Math.max(a.y1, shapeArea.y1));
    },

    shapeData() {
      if (!shape) return null;
      if (!lips.asked && !head.asked) return shape.data;
      // The shares go after the whole, the lips first, and the length says which are there. With the share of
      // the head and none of the lips, the place of the lips holds zeros.
      const size = shape.data.length;
      const all = new Float32Array(size * (head.asked ? 3 : 2));
      all.set(shape.data);
      if (lips.asked) all.set(lips.asked.data, size);
      if (head.asked) all.set(head.asked.data, size * 2);
      return all;
    },

    restoreShape(data) {
      if (!data) {
        shape = null;
        lips.asked = null;
        head.asked = null;
        shapeArea = { x0: 0, y0: 0, x1: 0, y1: 0 };
      } else {
        const size = w * h * 2;
        shape ??= new DisplacementGrid(w, h);
        shape.data.set(data.subarray(0, size));
        for (const [share, at] of [[lips, size], [head, size * 2]] as const) {
          const part = data.length >= at + size ? data.subarray(at, at + size) : null;
          if (part?.some((v) => v !== 0)) {
            share.asked ??= new DisplacementGrid(w, h);
            share.asked.data.set(part);
          } else {
            share.asked = null;
          }
        }
        shapeArea = { x0: 0, y0: 0, x1: w, y1: h };
      }
      compose(0, 0, w, h);
    },

    maxDisplacement: () => whole.maxDisplacement(),
    destroy: () => {
      glc.destroyTex(tex);
      glc.destroyTex(brushTex);
      if (lips.tex) glc.destroyTex(lips.tex);
      if (head.tex) glc.destroyTex(head.tex);
    },
  };
}
