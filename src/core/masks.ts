import type { GLContext, Rect, Tex } from './gl/context';
import type { BrushSettings, Dab } from './brush';
import { TileTracker } from './brush';
import { decodeTile, encodeTile } from './history/codec';
import type { LayerId } from './doc';
import { APPLY_FRAG, DAB_FRAG } from './shaders/small';
import { shader } from './pipeline/pipeline';
import type { MaskProvider } from './pipeline/types';

export const MASK_TILE = 128;

/** Side of the cells that say where the brush limit has something. */
const LIMIT_CELL = 16;

export interface MaskTile extends Rect {
  data: Uint8Array;
}

/** Per-tool masks. R8 textures with mip levels, allocated only when a tool is first used. */
export class MaskStore implements MaskProvider {
  private readonly masks = new Map<LayerId, Tex>();
  private readonly revs = new Map<LayerId, number>();
  private base: Tex | null = null;
  private stroke: Tex | null = null;
  private tracker: TileTracker | null = null;
  private current: { tex: Tex; settings: BrushSettings } | null = null;
  /** Where a stroke may land, for the open tool. It is not a mask, so it is never saved. */
  private limit: { tex: Tex; cells: Uint8Array; columns: number } | null = null;
  readonly w: number;
  readonly h: number;

  constructor(
    private readonly glc: GLContext,
    imageW: number,
    imageH: number,
    maxSide: number,
  ) {
    const s = Math.min(1, maxSide / Math.max(imageW, imageH));
    this.w = Math.max(1, Math.round(imageW * s));
    this.h = Math.max(1, Math.round(imageH * s));
  }

  get(id: LayerId): Tex | null {
    return this.masks.get(id) ?? null;
  }

  rev(id: LayerId): number {
    return this.revs.get(id) ?? 0;
  }

  bump(id: LayerId): void {
    this.revs.set(id, this.rev(id) + 1);
  }

  ensure(id: LayerId): Tex {
    let t = this.masks.get(id);
    if (!t) {
      t = this.glc.createTex(this.w, this.h, 'r8', { mips: true });
      this.glc.clear(t);
      this.masks.set(id, t);
    }
    return t;
  }

  ids(): LayerId[] {
    return [...this.masks.keys()];
  }

  get limited(): boolean {
    return !!this.limit;
  }

  /** The limit as a texture, for the view to show where the brush reaches. */
  get limitTex(): Tex | null {
    return this.limit?.tex ?? null;
  }

  /** Paint lands only where `data` has something. Without data the brush is free. */
  setLimit(data: Uint8Array | null): void {
    if (this.limit) this.glc.destroyTex(this.limit.tex);
    this.limit = null;
    if (!data) return;
    const { w, h } = this;
    const tex = this.glc.createTex(w, h, 'r8');
    this.glc.upload(tex, { x: 0, y: 0, w, h }, data);
    const columns = Math.ceil(w / LIMIT_CELL);
    const cells = new Uint8Array(columns * Math.ceil(h / LIMIT_CELL));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[y * w + x]) cells[Math.floor(y / LIMIT_CELL) * columns + Math.floor(x / LIMIT_CELL)] = 1;
      }
    }
    this.limit = { tex, cells, columns };
  }

  /** True when a dab comes near the limit, so the stroke has something to show. */
  reaches(dabs: readonly Dab[]): boolean {
    const { limit } = this;
    if (!limit) return true;
    const rows = limit.cells.length / limit.columns;
    const cell = (at: number, last: number) => Math.min(last, Math.max(0, Math.floor(at / LIMIT_CELL)));
    for (const { x, y, radius } of dabs) {
      for (let row = cell(y - radius, rows - 1); row <= cell(y + radius, rows - 1); row++) {
        for (let column = cell(x - radius, limit.columns - 1); column <= cell(x + radius, limit.columns - 1); column++) {
          if (limit.cells[row * limit.columns + column]) return true;
        }
      }
    }
    return false;
  }

  private scratch(): { base: Tex; stroke: Tex } {
    this.base ??= this.glc.createTex(this.w, this.h, 'r8');
    this.stroke ??= this.glc.createTex(this.w, this.h, this.glc.caps.stroke);
    return { base: this.base, stroke: this.stroke };
  }

  beginStroke(id: LayerId, settings: BrushSettings): void {
    const tex = this.ensure(id);
    const { base, stroke } = this.scratch();
    this.glc.copy(tex, base);
    this.glc.clear(stroke);
    this.current = { tex, settings };
    this.tracker = new TileTracker(this.w, this.h, MASK_TILE);
  }

  /** Blends dabs into the stroke buffer, then rebuilds the touched area of the mask. */
  paint(dabs: readonly Dab[], id: LayerId): Rect | null {
    if (!this.current || !this.tracker || dabs.length === 0) return null;
    const { glc } = this;
    const { gl } = glc;
    const { tex, settings } = this.current;
    const dab = glc.program(shader(DAB_FRAG));
    const stroke = this.stroke!;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    for (const d of dabs) {
      const r = d.radius + 1;
      const rect = clipRect(d.x - r, d.y - r, 2 * r, 2 * r, this.w, this.h);
      if (!rect) continue;
      glc.run(dab, stroke, { uDab: [d.x, d.y, Math.max(d.radius, 0.75)], uHardness: settings.hardness, uFlow: d.flow }, rect);
      this.tracker.mark(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
      x0 = Math.min(x0, rect.x);
      y0 = Math.min(y0, rect.y);
      x1 = Math.max(x1, rect.x + rect.w);
      y1 = Math.max(y1, rect.y + rect.h);
    }
    gl.disable(gl.BLEND);
    if (x1 <= x0) return null;
    const rect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    glc.run(
      glc.program(shader(APPLY_FRAG)),
      tex,
      { uBase: this.base!, uStroke: stroke, uLimit: this.limit?.tex ?? this.base!, uOpacity: settings.opacity, uErase: settings.erase, uLimited: !!this.limit },
      rect,
    );
    this.bump(id);
    return rect;
  }

  /** Closes the stroke and captures the previous content of the touched tiles. */
  async endStroke(): Promise<MaskTile[]> {
    const tracker = this.tracker;
    this.current = null;
    this.tracker = null;
    if (!tracker || tracker.empty) return [];
    return this.readTiles(this.base!, tracker);
  }

  cancelStroke(id: LayerId): void {
    if (this.current && this.base) {
      this.glc.copy(this.base, this.current.tex);
      this.bump(id);
    }
    this.current = null;
    this.tracker = null;
  }

  private async readTiles(src: Tex, tracker: TileTracker): Promise<MaskTile[]> {
    if (tracker.empty) return [];
    // Tiles go past the stroke itself, so the read must cover them whole.
    const b = tracker.tileBounds;
    const { data, channels } = await this.glc.readAsync(src, b);
    return tracker.tiles().map((t) => {
      const buf = new Uint8Array(t.w * t.h);
      for (let y = 0; y < t.h; y++) {
        const row = (t.y + y - b.y) * b.w + (t.x - b.x);
        if (channels === 1) {
          buf.set(data.subarray(row, row + t.w), y * t.w);
        } else {
          for (let x = 0; x < t.w; x++) buf[y * t.w + x] = data[(row + x) * channels];
        }
      }
      return { ...t, data: encodeTile(buf, t.w, t.h) };
    });
  }

  /** Reads the given tiles and writes `tiles` in their place. Returns the replaced content. */
  async swapTiles(id: LayerId, tiles: MaskTile[]): Promise<MaskTile[]> {
    const tex = this.ensure(id);
    const tracker = new TileTracker(this.w, this.h, MASK_TILE);
    for (const t of tiles) tracker.mark(t.x, t.y, t.x + t.w, t.y + t.h);
    const previous = await this.readTiles(tex, tracker);
    for (const t of tiles) {
      this.glc.upload(tex, t, decodeTile(t.data, t.w, t.h));
    }
    this.bump(id);
    return previous;
  }

  /** Full mask as bytes, for saving. */
  async read(id: LayerId): Promise<Uint8Array | null> {
    const tex = this.masks.get(id);
    if (!tex) return null;
    const { data, channels } = await this.glc.readAsync(tex, { x: 0, y: 0, w: this.w, h: this.h });
    if (channels === 1) return data;
    const out = new Uint8Array(this.w * this.h);
    for (let i = 0; i < out.length; i++) out[i] = data[i * channels];
    return out;
  }

  write(id: LayerId, data: Uint8Array): void {
    const tex = this.ensure(id);
    this.glc.upload(tex, { x: 0, y: 0, w: this.w, h: this.h }, data);
    this.bump(id);
  }

  clear(id: LayerId): void {
    const tex = this.masks.get(id);
    if (tex) {
      this.glc.clear(tex);
      this.bump(id);
    }
  }

  destroy(): void {
    this.setLimit(null);
    for (const t of this.masks.values()) this.glc.destroyTex(t);
    this.masks.clear();
    if (this.base) this.glc.destroyTex(this.base);
    if (this.stroke) this.glc.destroyTex(this.stroke);
    this.base = null;
    this.stroke = null;
  }
}

function clipRect(x: number, y: number, w: number, h: number, maxW: number, maxH: number): Rect | null {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(maxW, Math.ceil(x + w));
  const y1 = Math.min(maxH, Math.ceil(y + h));
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
