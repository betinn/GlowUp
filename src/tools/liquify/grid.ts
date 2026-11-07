/**
 * Liquify displacement grid. Pure math, testable without a GPU.
 * Each cell stores an offset in image UV: output(p) = input(p + D(p)).
 * Dabs advect the field semi-Lagrangian style, so strokes compose without tearing.
 */

export type LiquifyMode = 'push' | 'bloat' | 'pinch' | 'restore';

export const GRID_TILE = 32;

export interface GridTile {
  x: number;
  y: number;
  w: number;
  h: number;
  data: Float32Array;
}

export class DisplacementGrid {
  readonly data: Float32Array;
  private readonly touched = new Map<number, Float32Array>();
  private readonly cols: number;
  /** Rectangle changed since the last `takeDirty`. */
  private dirty: { x0: number; y0: number; x1: number; y1: number } | null = null;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Float32Array(w * h * 2);
    this.cols = Math.ceil(w / GRID_TILE);
  }

  /** Bilinear lookup in UV, clamped at the borders. */
  sample(u: number, v: number): [number, number] {
    return this.sampleCell(u * this.w - 0.5, v * this.h - 0.5, this.data, 0, 0, this.w, this.h);
  }

  private sampleCell(x: number, y: number, src: Float32Array, ox: number, oy: number, sw: number, sh: number): [number, number] {
    const fx = Math.min(sw - 1, Math.max(0, x - ox));
    const fy = Math.min(sh - 1, Math.max(0, y - oy));
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(sw - 1, x0 + 1);
    const y1 = Math.min(sh - 1, y0 + 1);
    const tx = fx - x0;
    const ty = fy - y0;
    const i00 = (y0 * sw + x0) * 2;
    const i10 = (y0 * sw + x1) * 2;
    const i01 = (y1 * sw + x0) * 2;
    const i11 = (y1 * sw + x1) * 2;
    const a = src[i00] + (src[i10] - src[i00]) * tx;
    const b = src[i01] + (src[i11] - src[i01]) * tx;
    const c = src[i00 + 1] + (src[i10 + 1] - src[i00 + 1]) * tx;
    const d = src[i01 + 1] + (src[i11 + 1] - src[i01 + 1]) * tx;
    return [a + (b - a) * ty, c + (d - c) * ty];
  }

  private snapshot(x0: number, y0: number, x1: number, y1: number): void {
    const t = GRID_TILE;
    for (let r = Math.floor(y0 / t); r <= Math.floor((y1 - 1) / t); r++) {
      for (let c = Math.floor(x0 / t); c <= Math.floor((x1 - 1) / t); c++) {
        const key = r * this.cols + c;
        if (this.touched.has(key)) continue;
        this.touched.set(key, this.copyTile(c * t, r * t).data);
      }
    }
  }

  private copyTile(x: number, y: number): GridTile {
    const w = Math.min(GRID_TILE, this.w - x);
    const h = Math.min(GRID_TILE, this.h - y);
    const data = new Float32Array(w * h * 2);
    for (let row = 0; row < h; row++) {
      const start = ((y + row) * this.w + x) * 2;
      data.set(this.data.subarray(start, start + w * 2), row * w * 2);
    }
    return { x, y, w, h, data };
  }

  /**
   * Applies one dab. `cx, cy, radius` are in cells, `mx, my` is the motion in cells for push.
   * `strength` is 0..1.
   */
  dab(mode: LiquifyMode, cx: number, cy: number, radius: number, strength: number, mx = 0, my = 0): void {
    const reach = Math.ceil(radius + Math.max(Math.abs(mx), Math.abs(my), radius * 0.3)) + 2;
    const x0 = Math.max(0, Math.floor(cx - reach));
    const y0 = Math.max(0, Math.floor(cy - reach));
    const x1 = Math.min(this.w, Math.ceil(cx + reach));
    const y1 = Math.min(this.h, Math.ceil(cy + reach));
    if (x1 <= x0 || y1 <= y0) return;
    this.snapshot(x0, y0, x1, y1);

    const sw = x1 - x0;
    const sh = y1 - y0;
    const old = new Float32Array(sw * sh * 2);
    for (let y = 0; y < sh; y++) {
      const start = ((y0 + y) * this.w + x0) * 2;
      old.set(this.data.subarray(start, start + sw * 2), y * sw * 2);
    }

    const r2 = radius * radius;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r2) continue;
        const f = 1 - d2 / r2;
        const weight = f * f;
        const i = (y * this.w + x) * 2;
        if (mode === 'restore') {
          const k = 1 - weight * strength * 0.35;
          this.data[i] *= k;
          this.data[i + 1] *= k;
          continue;
        }
        let vx: number;
        let vy: number;
        if (mode === 'push') {
          vx = mx * weight * strength;
          vy = my * weight * strength;
        } else {
          const k = (mode === 'bloat' ? 1 : -1) * 0.09 * strength * weight;
          vx = dx * k;
          vy = dy * k;
        }
        const [ou, ov] = this.sampleCell(x - vx, y - vy, old, x0, y0, sw, sh);
        this.data[i] = ou - vx / this.w;
        this.data[i + 1] = ov - vy / this.h;
      }
    }
    this.markDirty(x0, y0, x1, y1);
  }

  private markDirty(x0: number, y0: number, x1: number, y1: number): void {
    const d = this.dirty;
    if (!d) {
      this.dirty = { x0, y0, x1, y1 };
    } else {
      d.x0 = Math.min(d.x0, x0);
      d.y0 = Math.min(d.y0, y0);
      d.x1 = Math.max(d.x1, x1);
      d.y1 = Math.max(d.y1, y1);
    }
  }

  takeDirty(): { x: number; y: number; w: number; h: number } | null {
    const d = this.dirty;
    this.dirty = null;
    return d ? { x: d.x0, y: d.y0, w: d.x1 - d.x0, h: d.y1 - d.y0 } : null;
  }

  /** Ends a stroke and returns the state of every tile it changed, as it was before. */
  takeSnapshot(): GridTile[] {
    const out: GridTile[] = [];
    for (const [key, data] of this.touched) {
      const x = (key % this.cols) * GRID_TILE;
      const y = Math.floor(key / this.cols) * GRID_TILE;
      out.push({ x, y, w: Math.min(GRID_TILE, this.w - x), h: Math.min(GRID_TILE, this.h - y), data });
    }
    this.touched.clear();
    return out;
  }

  /** Writes tiles back and returns what they replaced. */
  swap(tiles: GridTile[]): GridTile[] {
    return tiles.map((t) => {
      const previous = this.copyTile(t.x, t.y);
      for (let row = 0; row < t.h; row++) {
        this.data.set(t.data.subarray(row * t.w * 2, (row + 1) * t.w * 2), ((t.y + row) * this.w + t.x) * 2);
      }
      this.markDirty(t.x, t.y, t.x + t.w, t.y + t.h);
      return previous;
    });
  }

  isEmpty(): boolean {
    for (let i = 0; i < this.data.length; i++) {
      if (Math.abs(this.data[i]) > 1e-6) return false;
    }
    return true;
  }

  /** Largest displacement, in UV. */
  maxDisplacement(): number {
    let m = 0;
    for (let i = 0; i < this.data.length; i++) m = Math.max(m, Math.abs(this.data[i]));
    return m;
  }
}
