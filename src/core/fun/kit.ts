/**
 * Small parts to build face effects with. Plain math, so effects can be tested without a GPU. Lengths are
 * shares of the long side of the photo, as in `FunFace`.
 */

import { headAlone } from '../face/reshape';
import type { Face } from '../face/scan';
import { faceFrame, type FaceFrame } from '../face/shape';
import type { FunFace, FunPiece, Vec } from './types';

export const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A face read for Brincar, or null when its outline is too short to have a frame. */
export function readFace(face: Face, kx: number, ky: number): FunFace | null {
  const frame = faceFrame(face, kx, ky);
  if (!frame) return null;
  return { face, frame, kx, ky, flat: ([u, v]) => [u * kx, v * ky] };
}

/** The middle of a list of landmarks, in the terms of the face. */
export function middleOf(read: FunFace, points: readonly (readonly [number, number])[]): Vec {
  let x = 0;
  let y = 0;
  for (const p of points) {
    const [fx, fy] = read.flat(p);
    x += fx;
    y += fy;
  }
  return [x / Math.max(1, points.length), y / Math.max(1, points.length)];
}

/** The eyes, left of the photo first: middle and width. Empty when the face has no eyes. */
export function eyesOf(read: FunFace): { c: Vec; width: number }[] {
  return read.face.parts.eyes
    .filter((eye) => eye.length >= 9)
    .map((eye) => {
      const a = read.flat(eye[0]);
      const b = read.flat(eye[8]);
      return { c: middleOf(read, eye), width: Math.hypot(b[0] - a[0], b[1] - a[1]) };
    })
    .sort((p, q) => p.c[0] - q.c[0]);
}

/**
 * Grows what is around `c` by up to `1 / (1 - k)` at the middle, fading to nothing at `radius`. `k` from 0 to
 * below 1. The ring around the middle takes up the difference and never folds over: the reading point moves
 * outward along every radius.
 */
export function magnify(c: Vec, radius: number, k: number): FunPiece {
  return {
    x: c[0],
    y: c[1],
    reach: radius,
    add(x, y, out) {
      const dx = x - c[0];
      const dy = y - c[1];
      const s2 = (dx * dx + dy * dy) / (radius * radius);
      if (s2 >= 1) return;
      const w = k * (1 - s2) * (1 - s2);
      out[0] -= dx * w;
      out[1] -= dy * w;
    },
  };
}

/**
 * Grows a head with its hair by `scale` around a point of the neck under the chin, over the body and the
 * background, which stay. The head keeps its shape at any size: the zone that grows is measured on the head
 * as it was, so a point of the head reads the photo from where the head was, and past the head the warp fades
 * out. The neck goes along where it meets the jaw, as with the size of the head in the face menu.
 */
export function growHead(f: FaceFrame, scale: number): FunPiece {
  const half = f.halfWidth;
  const k = 1 - 1 / scale;
  const pivotT = 1.14;
  const px = f.ox + f.dx * f.length * pivotT - f.dy * f.mid;
  const py = f.oy + f.dy * f.length * pivotT + f.dx * f.mid;
  // How high the hair goes, as a share of the face, and how wide the head is, in half widths of the face.
  const top = 1;
  const sideHigh = 1.85;
  const sideLow = 1.05;
  const weight = (x: number, y: number) => {
    const rx = x - f.ox;
    const ry = y - f.oy;
    const t = (rx * f.dx + ry * f.dy) / f.length;
    const side = (rx * -f.dy + ry * f.dx - f.mid) / half;
    const sideways = Math.abs(side) / (sideHigh + (sideLow - sideHigh) * smooth(0.55, 0.95, t));
    const above = t < 0 ? -t / top : 0;
    return (1 - smooth(1, 1.5, Math.hypot(sideways, above))) * (1 - smooth(1.05, 1.4, t));
  };
  return {
    x: px,
    y: py,
    reach: (f.length * 2.7 + half * 3.2) * scale,
    alone: headAlone(f),
    add(x, y, out) {
      // Where this point was before the head grew: the weight is read there.
      const w = weight(px + (x - px) / scale, py + (y - py) / scale);
      if (w <= 0) return;
      out[0] -= (x - px) * k * w;
      out[1] -= (y - py) * k * w;
    },
  };
}
