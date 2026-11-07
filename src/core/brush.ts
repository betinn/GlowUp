/** Stroke geometry: turns pointer samples into evenly spaced dabs. Pure logic, no GL. */

export interface BrushSettings {
  /** Radius as a fraction of the image long side. */
  size: number;
  /** 0 is a soft falloff, 1 is a hard edge. */
  hardness: number;
  /** Ceiling for the stroke coverage. */
  opacity: number;
  /** Coverage added by each dab. */
  flow: number;
  erase: boolean;
}

export const DEFAULT_BRUSH: BrushSettings = { size: 0.03, hardness: 0.35, opacity: 1, flow: 0.5, erase: false };

export interface Dab {
  x: number;
  y: number;
  radius: number;
  flow: number;
}

export interface StrokePoint {
  x: number;
  y: number;
  pressure: number;
}

/**
 * Emits dabs every `spacing * radius` units along a smoothed path.
 * The smoothing is a light exponential filter, tuned to remove pointer jitter without lag.
 */
export class StrokeInterpolator {
  private last: StrokePoint | null = null;
  private smoothed: StrokePoint | null = null;
  private carry = 0;

  constructor(
    private readonly radius: number,
    private readonly flow: number,
    private readonly spacing = 0.14,
    private readonly smoothing = 0.45,
  ) {}

  private dab(p: StrokePoint): Dab {
    return { x: p.x, y: p.y, radius: this.radius * (0.4 + 0.6 * p.pressure), flow: this.flow };
  }

  add(p: StrokePoint): Dab[] {
    if (!this.last || !this.smoothed) {
      this.last = p;
      this.smoothed = p;
      return [this.dab(p)];
    }
    const k = this.smoothing;
    const s = this.smoothed;
    const next: StrokePoint = {
      x: s.x + (p.x - s.x) * (1 - k),
      y: s.y + (p.y - s.y) * (1 - k),
      pressure: s.pressure + (p.pressure - s.pressure) * (1 - k),
    };
    this.smoothed = next;
    return this.walk(next);
  }

  /** Draws the rest of the path up to the final pointer position. */
  finish(p: StrokePoint): Dab[] {
    if (!this.last) return [];
    return this.walk(p);
  }

  private walk(to: StrokePoint): Dab[] {
    const from = this.last!;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) return [];
    const step = Math.max(this.radius * this.spacing, 0.5);
    const out: Dab[] = [];
    let d = step - this.carry;
    while (d <= dist) {
      const t = d / dist;
      out.push(
        this.dab({
          x: from.x + dx * t,
          y: from.y + dy * t,
          pressure: from.pressure + (to.pressure - from.pressure) * t,
        }),
      );
      d += step;
    }
    this.carry = dist - (d - step);
    this.last = to;
    return out;
  }
}

/** Tracks which tiles a stroke touched, on a fixed grid. */
export class TileTracker {
  readonly cols: number;
  readonly rows: number;
  private readonly marks: Uint8Array;
  x0 = Infinity;
  y0 = Infinity;
  x1 = -Infinity;
  y1 = -Infinity;

  constructor(
    readonly w: number,
    readonly h: number,
    readonly tile: number,
  ) {
    this.cols = Math.ceil(w / tile);
    this.rows = Math.ceil(h / tile);
    this.marks = new Uint8Array(this.cols * this.rows);
  }

  mark(x0: number, y0: number, x1: number, y1: number): void {
    const cx0 = Math.max(0, Math.floor(x0));
    const cy0 = Math.max(0, Math.floor(y0));
    const cx1 = Math.min(this.w, Math.ceil(x1));
    const cy1 = Math.min(this.h, Math.ceil(y1));
    if (cx1 <= cx0 || cy1 <= cy0) return;
    this.x0 = Math.min(this.x0, cx0);
    this.y0 = Math.min(this.y0, cy0);
    this.x1 = Math.max(this.x1, cx1);
    this.y1 = Math.max(this.y1, cy1);
    const t = this.tile;
    for (let r = Math.floor(cy0 / t); r <= Math.floor((cy1 - 1) / t); r++) {
      for (let c = Math.floor(cx0 / t); c <= Math.floor((cx1 - 1) / t); c++) {
        this.marks[r * this.cols + c] = 1;
      }
    }
  }

  get empty() {
    return this.x1 <= this.x0;
  }

  get bounds() {
    return { x: this.x0, y: this.y0, w: this.x1 - this.x0, h: this.y1 - this.y0 };
  }

  /** Lists touched tiles with their pixel rectangles. */
  tiles(): { x: number; y: number; w: number; h: number }[] {
    const out = [];
    const t = this.tile;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (!this.marks[r * this.cols + c]) continue;
        const x = c * t;
        const y = r * t;
        out.push({ x, y, w: Math.min(t, this.w - x), h: Math.min(t, this.h - y) });
      }
    }
    return out;
  }
}
