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
  /** The brush alone, for a background that moves with it. It exists only while the lock is off. */
  let brushTex: Tex | null = null;

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
    glc.upload(tex, rect, out.subarray((y0 * w + x0) * 2), w);
    if (brushTex) glc.upload(brushTex, rect, m.subarray((y0 * w + x0) * 2), w);
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
    get brushTex() {
      return brushTex;
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
        compose(shapeArea.x0, shapeArea.y0, shapeArea.x1, shapeArea.y1);
        shapeArea = { x0: 0, y0: 0, x1: 0, y1: 0 };
        return;
      }
      shape ??= new DisplacementGrid(w, h);
      const data = shape.data;
      const before = shapeArea;
      for (let y = before.y0; y < before.y1; y++) data.fill(0, (y * w + before.x0) * 2, (y * w + before.x1) * 2);
      const x0 = Math.max(0, Math.floor(next.area.u0 * w));
      const y0 = Math.max(0, Math.floor(next.area.v0 * h));
      const x1 = Math.min(w, Math.ceil(next.area.u1 * w));
      const y1 = Math.min(h, Math.ceil(next.area.v1 * h));
      shapeArea = { x0, y0, x1: Math.max(x0, x1), y1: Math.max(y0, y1) };
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const [du, dv] = next.offset((x + 0.5) / w, (y + 0.5) / h);
          if (!Number.isFinite(du) || !Number.isFinite(dv)) continue;
          const i = (y * w + x) * 2;
          data[i] = Math.abs(du) < STILL ? 0 : du;
          data[i + 1] = Math.abs(dv) < STILL ? 0 : dv;
        }
      }
      const has = before.x1 > before.x0 && before.y1 > before.y0;
      const a = has ? before : shapeArea;
      compose(Math.min(a.x0, shapeArea.x0), Math.min(a.y0, shapeArea.y0), Math.max(a.x1, shapeArea.x1), Math.max(a.y1, shapeArea.y1));
    },

    shapeData: () => shape?.data ?? null,

    restoreShape(data) {
      if (!data) {
        shape = null;
        shapeArea = { x0: 0, y0: 0, x1: 0, y1: 0 };
      } else {
        shape ??= new DisplacementGrid(w, h);
        shape.data.set(data);
        shapeArea = { x0: 0, y0: 0, x1: w, y1: h };
      }
      compose(0, 0, w, h);
    },

    setBrushOnBackground(on) {
      if (on && !brushTex) {
        brushTex = glc.createTex(w, h, 'rg16f', { noTarget: true });
        glc.upload(brushTex, { x: 0, y: 0, w, h }, grid.data);
      } else if (!on && brushTex) {
        glc.destroyTex(brushTex);
        brushTex = null;
      }
    },

    maxDisplacement: () => whole.maxDisplacement(),
    destroy: () => {
      glc.destroyTex(tex);
      if (brushTex) glc.destroyTex(brushTex);
    },
  };
}
