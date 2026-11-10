/**
 * Where a sticker shows. Its place is kept on the photo as it was opened, and the warps of the face, realistic
 * and playful, carry it where the face went: a sticker on the eyes stays on the eyes of a bigger head. Plain
 * math, so it can be tested without a GPU.
 */

import type { StickerState } from '../doc';

/** For a point shown at `u, v`, how far away in UV the head there is read from. */
export type Lookup = (u: number, v: number) => readonly [number, number];

/** The point shown at `q` reads `q + D(q)`. This finds the `q` that reads `p`: where a point of the photo shows. */
export function shownAt(p: readonly [number, number], lookup: Lookup): [number, number] {
  let qu = p[0];
  let qv = p[1];
  for (let i = 0; i < 12; i++) {
    const [du, dv] = lookup(qu, qv);
    const nu = p[0] - du;
    const nv = p[1] - dv;
    const still = Math.abs(nu - qu) < 1e-7 && Math.abs(nv - qv) < 1e-7;
    qu = nu;
    qv = nv;
    if (still) break;
  }
  return [qu, qv];
}

/** The point of the photo that shows at `q`. */
export function sourceAt(q: readonly [number, number], lookup: Lookup): [number, number] {
  const [du, dv] = lookup(q[0], q[1]);
  return [q[0] + du, q[1] + dv];
}

/** A sticker where it shows, after the warps: its middle in UV, its width in shares of the long side, its turn. */
export interface ShownSticker {
  x: number;
  y: number;
  size: number;
  angle: number;
}

/**
 * Where a sticker shows. Its middle and the two ends of its width each go where the warps take that point of
 * the face, so it grows, shrinks and turns with the face under it, and keeps its own shape.
 */
export function shownSticker(s: Pick<StickerState, 'x' | 'y' | 'size' | 'angle'>, w: number, h: number, lookup: Lookup | null): ShownSticker {
  if (!lookup) return { x: s.x, y: s.y, size: s.size, angle: s.angle };
  const long = Math.max(w, h);
  const kx = w / long;
  const ky = h / long;
  const half = s.size / 2;
  const ex = (Math.cos(s.angle) * half) / kx;
  const ey = (Math.sin(s.angle) * half) / ky;
  const c = shownAt([s.x, s.y], lookup);
  const a = shownAt([s.x - ex, s.y - ey], lookup);
  const b = shownAt([s.x + ex, s.y + ey], lookup);
  const bx = (b[0] - a[0]) * kx;
  const by = (b[1] - a[1]) * ky;
  const size = Math.hypot(bx, by);
  return { x: c[0], y: c[1], size: size > 0 ? size : s.size, angle: size > 0 ? Math.atan2(by, bx) : s.angle };
}
