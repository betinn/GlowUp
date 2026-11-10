/**
 * The field of Brincar on the GPU, and the art of its stickers. A field of its own, beside the one of Liquify
 * and the face menu: two grids, the whole warp and the share of it that moves a head alone, both in one RGBA16F
 * texture, which `develop.frag` reads before the realistic field. One texture, because the develop stage
 * already reads fifteen and many phones read no more than sixteen. See `core/fun/field.ts`.
 */

import { DisplacementGrid } from '../../tools/liquify/grid';
import { fieldGridSize } from '../../tools/liquify/index';
import type { FieldGrids, GridArea } from '../face/fieldwork';
import { fillField } from '../face/fieldwork';
import type { GLContext, Tex } from '../gl/context';
import { funFieldFrom } from './field';
import { stickerById } from './stickers/index';
import type { FunSource, StickerDef } from './types';

/** The smallest and largest side a sticker is drawn at. */
const ART_MIN = 64;
const ART_MAX = 4096;

export interface FunController {
  /** The whole warp of Brincar in red and green, and the share of it that moves a head alone in blue and alpha. */
  readonly tex: Tex;
  /** An effect asks for a share that moves a head alone. */
  readonly alone: boolean;
  readonly gridSize: { w: number; h: number };
  /** How far away in UV a point shown at `u, v` reads the photo, by Brincar alone. */
  lookup(u: number, v: number): [number, number];
  isEmpty(): boolean;
  /** Works the field out from what the document asks for, on the page. Null takes it off. */
  setSource(source: FunSource | null): void;
  /** Puts a field worked out elsewhere in place. Null takes it off. */
  setGrids(grids: FieldGrids | null): void;
  /** The field as it stands, for saving: the whole, and after it the share of the head when there is one. */
  data(): Float32Array | null;
  restore(data: Float32Array | null): void;
  maxDisplacement(): number;
  /**
   * The art of a sticker at about `px` pixels on its longer side, ready to sample, or the nearest size there is
   * while that one is drawn. Null until the first size is ready; `onArt` says when one is.
   */
  art(kind: string, px: number): Tex | null;
  /** Height over width of the art of a sticker. 1 for a kind this version does not know. */
  aspectOf(kind: string): number;
  /** Resolves once each sticker has its art at the size asked for. */
  artReady(asks: readonly { kind: string; px: number }[]): Promise<void>;
  destroy(): void;
}

/** The side a sticker of `px` pixels is drawn at: a power of two, so a few sizes cover every zoom. */
export function artSide(px: number, most = ART_MAX): number {
  const side = 2 ** Math.ceil(Math.log2(Math.max(1, px)));
  return Math.min(most, Math.max(ART_MIN, side));
}

/** The pixels of the art of a sticker at `w` by `h`, with the color already multiplied by its cover. */
async function draw(def: StickerDef, w: number, h: number): Promise<Uint8Array> {
  const sized = def.svg.replace('<svg ', `<svg width="${w}" height="${h}" preserveAspectRatio="none" `);
  const url = URL.createObjectURL(new Blob([sized], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = new OffscreenCanvas(w, h);
    const g = canvas.getContext('2d')!;
    g.drawImage(img, 0, 0, w, h);
    const data = new Uint8Array(g.getImageData(0, 0, w, h).data.buffer);
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a === 255) continue;
      data[i] = Math.round((data[i] * a) / 255);
      data[i + 1] = Math.round((data[i + 1] * a) / 255);
      data[i + 2] = Math.round((data[i + 2] * a) / 255);
    }
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function createFun(glc: GLContext, imageW: number, imageH: number, onArt: () => void): FunController {
  const { w, h } = fieldGridSize(imageW, imageH);
  const whole = new DisplacementGrid(w, h);
  let alone: DisplacementGrid | null = null;
  let area: GridArea = { x0: 0, y0: 0, x1: 0, y1: 0 };
  let empty = true;
  const tex = glc.createTex(w, h, 'rgba16f', { noTarget: true });
  glc.upload(tex, { x: 0, y: 0, w, h }, new Float32Array(w * h * 4));

  const none = (a: GridArea) => a.x1 <= a.x0 || a.y1 <= a.y0;
  const union = (a: GridArea, b: GridArea): GridArea =>
    none(a) ? b : none(b) ? a : { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };

  /** Clears `before` in a grid and writes the rows of `next` over its area. */
  const fill = (grid: DisplacementGrid, before: GridArea, next: GridArea | null, rows: Float32Array | null) => {
    const { data } = grid;
    for (let y = before.y0; y < before.y1; y++) data.fill(0, (y * w + before.x0) * 2, (y * w + before.x1) * 2);
    if (next && rows && !none(next)) {
      const wide = (next.x1 - next.x0) * 2;
      for (let y = next.y0; y < next.y1; y++) data.set(rows.subarray((y - next.y0) * wide, (y - next.y0 + 1) * wide), (y * w + next.x0) * 2);
    }
    grid.changed();
  };

  /** Sends an area of both grids to the texture, side by side in each texel. */
  const send = (a: GridArea) => {
    if (none(a)) return;
    const aw = a.x1 - a.x0;
    const ah = a.y1 - a.y0;
    const out = new Float32Array(aw * ah * 4);
    const head = alone?.data;
    for (let y = 0; y < ah; y++) {
      for (let x = 0; x < aw; x++) {
        const i = ((a.y0 + y) * w + a.x0 + x) * 2;
        const o = (y * aw + x) * 4;
        out[o] = whole.data[i];
        out[o + 1] = whole.data[i + 1];
        if (head) {
          out[o + 2] = head[i];
          out[o + 3] = head[i + 1];
        }
      }
    }
    glc.upload(tex, { x: a.x0, y: a.y0, w: aw, h: ah }, out);
  };

  const setGrids = (next: FieldGrids | null) => {
    const before = area;
    const nextArea = next && !none(next.area) ? { ...next.area } : { x0: 0, y0: 0, x1: 0, y1: 0 };
    fill(whole, before, nextArea, next?.whole ?? null);
    // A share that comes or goes changes texels outside the areas too: the whole texture is sent then.
    const turned = !!next?.alone !== !!alone;
    if (next?.alone) {
      alone ??= new DisplacementGrid(w, h);
      fill(alone, before, nextArea, next.alone);
    } else {
      alone = null;
    }
    area = nextArea;
    empty = !next || none(nextArea) || whole.isEmpty();
    send(turned ? { x0: 0, y0: 0, x1: w, y1: h } : union(before, nextArea));
  };

  /** The art drawn so far, per sticker: each size, and the sizes on their way. */
  const arts = new Map<string, { sides: Map<number, Tex>; drawing: Map<number, Promise<void>> }>();
  let gone = false;
  const most = Math.min(ART_MAX, glc.caps.maxTexture);

  const drawArt = (kind: string, side: number): Promise<void> => {
    const def = stickerById(kind);
    if (!def) return Promise.resolve();
    let entry = arts.get(kind);
    if (!entry) {
      entry = { sides: new Map(), drawing: new Map() };
      arts.set(kind, entry);
    }
    const { sides, drawing } = entry;
    if (sides.has(side)) return Promise.resolve();
    const pending = drawing.get(side);
    if (pending) return pending;
    // The longer side of the art gets `side` pixels.
    const aw = def.aspect <= 1 ? side : Math.max(1, Math.round(side / def.aspect));
    const ah = def.aspect <= 1 ? Math.max(1, Math.round(side * def.aspect)) : side;
    const job = draw(def, aw, ah)
      .then((pixels) => {
        if (gone) return;
        const t = glc.createTex(aw, ah, 'rgba8', { mips: true, noTarget: true });
        glc.upload(t, { x: 0, y: 0, w: aw, h: ah }, pixels);
        glc.generateMips(t);
        sides.set(side, t);
        onArt();
      })
      .catch((err: unknown) => console.error('sticker art', kind, err))
      .finally(() => drawing.delete(side));
    drawing.set(side, job);
    return job;
  };

  return {
    tex,
    get alone() {
      return !!alone;
    },
    gridSize: { w, h },
    lookup: (u, v) => (empty ? [0, 0] : whole.sample(u, v)),
    isEmpty: () => empty,
    setSource(source) {
      const field = source ? funFieldFrom(source) : null;
      setGrids(field ? fillField(field, w, h) : null);
    },
    setGrids,
    data() {
      if (empty) return null;
      if (!alone) return whole.data;
      const all = new Float32Array(whole.data.length * 2);
      all.set(whole.data);
      all.set(alone.data, whole.data.length);
      return all;
    },
    restore(data) {
      const size = w * h * 2;
      if (!data || data.length < size) {
        setGrids(null);
        return;
      }
      const full: GridArea = { x0: 0, y0: 0, x1: w, y1: h };
      const share = data.length >= size * 2 ? data.subarray(size, size * 2) : null;
      setGrids({ area: full, whole: data.subarray(0, size), over: null, alone: share?.some((v) => v !== 0) ? share : null });
    },
    maxDisplacement: () => (empty ? 0 : whole.maxDisplacement()),
    art(kind, px) {
      const side = artSide(px, most);
      const sides = arts.get(kind)?.sides;
      const exact = sides?.get(side);
      if (exact) return exact;
      void drawArt(kind, side);
      if (!sides?.size) return null;
      // Meanwhile, the size nearest to the one asked for.
      let best: Tex | null = null;
      let bestGap = Infinity;
      for (const [s, t] of sides) {
        const gap = Math.abs(Math.log2(s / side));
        if (gap < bestGap) {
          best = t;
          bestGap = gap;
        }
      }
      return best;
    },
    aspectOf: (kind) => stickerById(kind)?.aspect ?? 1,
    async artReady(asks) {
      await Promise.all(asks.map(({ kind, px }) => drawArt(kind, artSide(px, most))));
    },
    destroy() {
      gone = true;
      glc.destroyTex(tex);
      for (const { sides } of arts.values()) for (const t of sides.values()) glc.destroyTex(t);
      arts.clear();
    },
  };
}
