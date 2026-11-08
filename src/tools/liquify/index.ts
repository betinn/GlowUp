import type { FieldController } from '../../core/engine';
import type { GLContext, Tex } from '../../core/gl/context';
import type { HistoryEntry } from '../../core/history/history';
import { DisplacementGrid, strokeTo, type GridTile, type LiquifyMode } from './grid';

const GRID_SIDE = 1024;

/**
 * Connects the CPU grid to its RG16F texture, which the develop shader samples to warp the image. Nothing
 * here belongs to Liquify alone, so a second field of the same kind is one more call.
 */
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
    lookup: (u, v) => grid.sample(u, v),

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
