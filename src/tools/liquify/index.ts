import type { FieldController } from '../../core/engine';
import type { GLContext, Tex } from '../../core/gl/context';
import type { HistoryEntry } from '../../core/history/history';
import { DisplacementGrid, type GridTile, type LiquifyMode } from './grid';

const GRID_SIDE = 1024;

/** Connects the CPU grid to its RG16F texture, which the develop shader samples to warp the image. */
export function createField(glc: GLContext, imageW: number, imageH: number): FieldController {
  const long = Math.max(imageW, imageH);
  const w = Math.max(2, Math.round((imageW / long) * GRID_SIDE));
  const h = Math.max(2, Math.round((imageH / long) * GRID_SIDE));
  const grid = new DisplacementGrid(w, h);
  const tex: Tex = glc.createTex(w, h, 'rg16f', { noTarget: true });
  glc.upload(tex, { x: 0, y: 0, w, h }, grid.data);

  let mode: LiquifyMode = 'push';
  let radius = 0;
  let strength = 0;
  let last: [number, number] | null = null;

  const flush = () => {
    const d = grid.takeDirty();
    if (!d) return;
    glc.upload(tex, d, grid.data.subarray((d.y * w + d.x) * 2), w);
  };

  return {
    tex,
    lookup: (u, v) => grid.sample(u, v),

    begin(nextMode, size, nextStrength) {
      mode = nextMode as LiquifyMode;
      radius = size * Math.max(w, h);
      strength = nextStrength;
      last = null;
    },

    stroke(u, v) {
      const x = u * w;
      const y = v * h;
      if (!last) {
        last = [x, y];
        if (mode !== 'push') grid.dab(mode, x, y, radius, strength);
        flush();
        return;
      }
      const dx = x - last[0];
      const dy = y - last[1];
      const dist = Math.hypot(dx, dy);
      const steps = Math.max(1, Math.ceil(dist / Math.max(radius * 0.18, 1)));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        grid.dab(mode, last[0] + dx * t, last[1] + dy * t, radius, strength, dx / steps, dy / steps);
      }
      last = [x, y];
      flush();
    },

    end(): HistoryEntry | null {
      let tiles: GridTile[] = grid.takeSnapshot();
      if (!tiles.length) return null;
      const swap = () => {
        tiles = grid.swap(tiles);
        flush();
      };
      return {
        label: 'Liquify',
        bytes: tiles.reduce((n, t) => n + t.data.byteLength + 48, 0),
        undo: swap,
        redo: swap,
      };
    },

    isEmpty: () => grid.isEmpty(),
    serialize: () => grid.data,

    restore(data) {
      grid.data.set(data);
      glc.upload(tex, { x: 0, y: 0, w, h }, grid.data);
    },

    maxDisplacement: () => grid.maxDisplacement(),
    destroy: () => glc.destroyTex(tex),
  };
}
