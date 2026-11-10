import type { FieldController } from '../../core/engine';
import { fieldFrom, fillField, type FieldGrids } from '../../core/face/fieldwork';
import type { GLContext, Tex } from '../../core/gl/context';
import type { HistoryEntry } from '../../core/history/history';
import { DisplacementGrid, strokeTo, type GridTile, type LiquifyMode } from './grid';

const GRID_SIDE = 1024;

/** The size of the grid of the field of a photo. */
export function fieldGridSize(imageW: number, imageH: number): { w: number; h: number } {
  const long = Math.max(imageW, imageH);
  return { w: Math.max(2, Math.round((imageW / long) * GRID_SIDE)), h: Math.max(2, Math.round((imageH / long) * GRID_SIDE)) };
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
  const { w, h } = fieldGridSize(imageW, imageH);
  const grid = new DisplacementGrid(w, h);
  /** What the sliders and the automatic mode ask for, in the same terms. Null when nothing. */
  let shape: DisplacementGrid | null = null;
  /** Where it holds something. */
  let shapeArea = { x0: 0, y0: 0, x1: 0, y1: 0 };
  /** The shape holds no move at all, counted from what came in. Null when it must be counted from the grid. */
  let shapeStill: boolean | null = null;
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
  const compose = (x0: number, y0: number, x1: number, y1: number, brushToo = true) => {
    const m = grid.data;
    const out = whole.data;
    // With no stroke at all, every cell reads the shape as it is: rows are copied whole, the same numbers.
    const bare = grid.isZero();
    const copyRows = (from: Float32Array | null, to: Float32Array, a: { x0: number; y0: number; x1: number; y1: number }) => {
      for (let y = a.y0; y < a.y1; y++) {
        const i = (y * w + a.x0) * 2;
        const j = (y * w + a.x1) * 2;
        if (from) to.set(from.subarray(i, j), i);
        else to.fill(0, i, j);
      }
    };
    if (bare) copyRows(shape?.data ?? null, out, { x0, y0, x1, y1 });
    for (let y = y0; y < (bare ? y0 : y1); y++) {
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
    // The brush alone only changes with a stroke, so a new shape leaves its texture as it was.
    if (brushToo) glc.upload(brushTex, rect, m.subarray((y0 * w + x0) * 2), w);
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
      if (bare) copyRows(asked.data, to, a);
      for (let y = a.y0; y < (bare ? a.y0 : a.y1); y++) {
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

  type Area = typeof shapeArea;
  const none = (a: Area) => a.x1 <= a.x0 || a.y1 <= a.y0;
  const union = (a: Area, b: Area): Area => (none(a) ? b : none(b) ? a : { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });
  /** Where the textures may show a rough field the grids do not hold. Composed again with the next field. */
  let roughArea: Area = { x0: 0, y0: 0, x1: 0, y1: 0 };
  /** Zeros to clear a texture with. Made the first time a rough field needs them. */
  let zeros: Float32Array | null = null;

  /** Writes the rows of a field over `area` into a grid, and clears what it held in `before`. */
  const fill = (grid: DisplacementGrid, before: Area, area: Area, rows: Float32Array) => {
    const { data } = grid;
    grid.changed();
    for (let y = before.y0; y < before.y1; y++) {
      // Rows the field writes are only cleared where it does not write.
      if (y >= area.y0 && y < area.y1 && !none(area)) {
        if (before.x0 < area.x0) data.fill(0, (y * w + before.x0) * 2, (y * w + Math.min(before.x1, area.x0)) * 2);
        if (before.x1 > area.x1) data.fill(0, (y * w + Math.max(before.x0, area.x1)) * 2, (y * w + before.x1) * 2);
      } else {
        data.fill(0, (y * w + before.x0) * 2, (y * w + before.x1) * 2);
      }
    }
    const wide = (area.x1 - area.x0) * 2;
    if (wide <= 0) return;
    for (let y = area.y0; y < area.y1; y++) data.set(rows.subarray((y - area.y0) * wide, (y - area.y0 + 1) * wide), (y * w + area.x0) * 2);
  };

  /** Sends rows of a field straight to a texture over `area`, and zeros over the rest of `cover`. */
  const sendRough = (t: Tex, cover: Area, area: Area, rows: Float32Array) => {
    zeros ??= new Float32Array(w * h * 2);
    const clear = (x0: number, y0: number, x1: number, y1: number) => {
      if (x1 > x0 && y1 > y0) glc.upload(t, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, zeros!);
    };
    if (none(area)) {
      clear(cover.x0, cover.y0, cover.x1, cover.y1);
      return;
    }
    clear(cover.x0, cover.y0, cover.x1, area.y0);
    clear(cover.x0, area.y1, cover.x1, cover.y1);
    clear(cover.x0, area.y0, area.x0, area.y1);
    clear(area.x1, area.y0, cover.x1, area.y1);
    glc.upload(t, { x: area.x0, y: area.y0, w: area.x1 - area.x0, h: area.y1 - area.y0 }, rows, area.x1 - area.x0);
  };

  /**
   * Shows a rough field while the finished one is on its way: with no stroke of the brush, its rows go straight
   * to the textures, and the grids keep the last finished field. Otherwise it takes the place of the shape.
   */
  const showRough = (next: FieldGrids) => {
    const fits = ([[lips, next.over], [head, next.alone]] as const).every(([share, of]) => !!of === !!share.tex && !!of === !!share.asked);
    if (!grid.isZero() || !fits) {
      setGrids(next);
      return;
    }
    const cover = union(union(roughArea, shapeArea), next.area);
    sendRough(tex, cover, next.area, next.whole);
    if (next.over) sendRough(lips.tex!, cover, next.area, next.over);
    if (next.alone) sendRough(head.tex!, cover, next.area, next.alone);
    roughArea = cover;
  };

  /** Puts the grids of a field in place of the shape, and sends what changed to the GPU. */
  const setGrids = (next: FieldGrids | null) => {
    if (!next) {
      if (!shape) return;
      shape = null;
      shapeStill = null;
      lips.asked = null;
      head.asked = null;
      const a = union(shapeArea, roughArea);
      roughArea = { x0: 0, y0: 0, x1: 0, y1: 0 };
      compose(a.x0, a.y0, a.x1, a.y1, false);
      shapeArea = { x0: 0, y0: 0, x1: 0, y1: 0 };
      return;
    }
    shape ??= new DisplacementGrid(w, h);
    const before = shapeArea;
    shapeArea = { ...next.area };
    shapeStill = true;
    for (let i = 0; i < next.whole.length; i++) {
      if (Math.abs(next.whole[i]) > 1e-6) {
        shapeStill = false;
        break;
      }
    }
    fill(shape, before, shapeArea, next.whole);
    for (const [share, of] of [[lips, next.over], [head, next.alone]] as const) {
      if (of) {
        share.asked ??= new DisplacementGrid(w, h);
        fill(share.asked, before, shapeArea, of);
      } else {
        share.asked = null;
      }
    }
    const has = before.x1 > before.x0 && before.y1 > before.y0;
    const a = has ? before : shapeArea;
    // What a rough field left on the textures is composed again too.
    const all = union({ x0: Math.min(a.x0, shapeArea.x0), y0: Math.min(a.y0, shapeArea.y0), x1: Math.max(a.x1, shapeArea.x1), y1: Math.max(a.y1, shapeArea.y1) }, roughArea);
    roughArea = { x0: 0, y0: 0, x1: 0, y1: 0 };
    compose(all.x0, all.y0, all.x1, all.y1, false);
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

    isEmpty: () => grid.isEmpty() && (!shape || (shapeStill ?? shape.isEmpty())),
    brushEmpty: () => grid.isEmpty(),
    serialize: () => grid.data,

    restore(data) {
      grid.data.set(data);
      grid.changed();
      compose(0, 0, w, h);
    },

    setShape(source) {
      const next = source ? fieldFrom(source) : null;
      setGrids(next ? fillField(next, w, h) : null);
    },

    setShapeGrids: setGrids,
    showRoughGrids: showRough,

    gridSize: { w, h },

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
        shape.changed();
        shapeStill = null;
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
