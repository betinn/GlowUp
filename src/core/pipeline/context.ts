import type { GLContext, Rect, Tex, TexFormat } from '../gl/context';

export interface Region {
  /** Area of the image this context covers, in source pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Context pixels per source pixel. */
  scale: number;
}

export interface DirtyFlags {
  healed: boolean;
  prefix: boolean;
  local: boolean;
  global: boolean;
}

type Slot = 'healed' | 'checkpoint' | 'retouched' | 'dev' | 'lit' | 'final' | 'unfiltered' | 'a' | 'b' | 'stick';

/**
 * Buffers for one rendering of the document at one resolution.
 * Preview keeps a long-lived context; export makes one per tile.
 */
export class RenderContext {
  readonly w: number;
  readonly h: number;
  readonly dirty: DirtyFlags = { healed: true, prefix: true, local: true, global: true };
  /** Pending partial update, in context pixels. `null` means the whole frame. */
  localRect: Rect | null = null;
  /** Key of the chain layout used by the last render. */
  stagesKey = '';
  /** Cached textures built by tools. Cleared when the healed base changes. */
  readonly cache = new Map<string, { key: string; tex: Tex[] }>();
  private readonly slots = new Map<Slot, Tex>();

  checkpointRef: Tex | null = null;
  retouchedRef: Tex | null = null;

  constructor(
    readonly glc: GLContext,
    readonly region: Region,
    readonly imageW: number,
    readonly imageH: number,
    readonly source: Tex,
  ) {
    this.w = source.w;
    this.h = source.h;
  }

  /** Image-normalized area covered by this context: x, y, width, height. */
  get regionUv(): [number, number, number, number] {
    const r = this.region;
    return [r.x / this.imageW, r.y / this.imageH, r.w / this.imageW, r.h / this.imageH];
  }

  /** Long side of the full image, in context pixels. */
  get longSide(): number {
    return Math.max(this.imageW, this.imageH) * this.region.scale;
  }

  get format(): TexFormat {
    return this.glc.caps.work;
  }

  slot(name: Slot): Tex {
    let t = this.slots.get(name);
    if (!t) {
      t = this.glc.createTex(this.w, this.h, this.format, { mips: name === 'healed' || name === 'dev' || name === 'lit' });
      this.slots.set(name, t);
    }
    return t;
  }

  /** Frees a buffer that is only needed for a while. */
  dropSlot(name: Slot): void {
    const t = this.slots.get(name);
    if (t) this.glc.destroyTex(t);
    this.slots.delete(name);
  }

  /** Reusable cache slot for tool helpers. Destroys the previous textures on a new key. */
  cached(name: string, key: string, build: () => Tex[]): Tex[] {
    const hit = this.cache.get(name);
    if (hit?.key === key) return hit.tex;
    hit?.tex.forEach((t) => this.glc.release(t));
    const tex = build();
    this.cache.set(name, { key, tex });
    return tex;
  }

  clearCache(): void {
    for (const entry of this.cache.values()) entry.tex.forEach((t) => this.glc.release(t));
    this.cache.clear();
  }

  invalidate(level: keyof DirtyFlags): void {
    const order: (keyof DirtyFlags)[] = ['healed', 'prefix', 'local', 'global'];
    for (const flag of order.slice(order.indexOf(level))) this.dirty[flag] = true;
    if (level !== 'global') this.localRect = null;
  }

  /** Marks part of the frame as changed by a brush. */
  touch(rect: Rect): void {
    if (this.dirty.local && !this.localRect) return;
    const r = this.localRect;
    if (!r) {
      this.localRect = { ...rect };
    } else {
      const x1 = Math.max(r.x + r.w, rect.x + rect.w);
      const y1 = Math.max(r.y + r.h, rect.y + rect.h);
      r.x = Math.min(r.x, rect.x);
      r.y = Math.min(r.y, rect.y);
      r.w = x1 - r.x;
      r.h = y1 - r.y;
    }
    this.dirty.local = true;
    this.dirty.global = true;
  }

  destroy(): void {
    this.clearCache();
    for (const t of this.slots.values()) this.glc.destroyTex(t);
    this.slots.clear();
    this.glc.destroyTex(this.source);
  }
}
