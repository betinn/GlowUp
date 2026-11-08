/** Shapes and photos drawn by hand, shared by the tests of the face. */

import type { Area, MaskTarget, Point } from '../../src/core/face/mask';
import { FACE_OVAL } from '../../src/core/face/scan';

/** A lens shape, like an open eye or a mouth, with `count` points starting at the left corner and going along the bottom. */
export function lens(cx: number, cy: number, halfW: number, halfH: number, count: number): Point[] {
  return Array.from({ length: count }, (_, i): Point => {
    const t = (i / count) * Math.PI * 2 + Math.PI;
    return [cx + Math.cos(t) * halfW, cy - Math.sin(t) * halfH];
  });
}

/** An oval face outline with as many points as the model gives, from the top of the forehead, the chin halfway. */
export function oval(cx: number, cy: number, rx: number, ry: number): Point[] {
  return Array.from({ length: FACE_OVAL.length }, (_, i): Point => {
    const t = (i / FACE_OVAL.length) * Math.PI * 2;
    return [cx + Math.sin(t) * rx, cy - Math.cos(t) * ry];
  });
}

export type Color = readonly [number, number, number];

/** The photo as a square mask grid of `size` sees it, painted from image UV. */
export function paintedPhoto(size: number, paint: (u: number, v: number) => Color): MaskTarget {
  const read = (area: Area) => {
    const out = new Uint8ClampedArray(area.w * area.h * 4);
    for (let y = 0; y < area.h; y++) {
      for (let x = 0; x < area.w; x++) out.set([...paint((x + area.x + 0.5) / size, (y + area.y + 0.5) / size), 255], (y * area.w + x) * 4);
    }
    return out;
  };
  return {
    w: size,
    h: size,
    color: read,
    luma: (area) => {
      const rgba = read(area);
      const out = new Float32Array(area.w * area.h);
      for (let i = 0; i < out.length; i++) out[i] = (0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2]) / 255;
      return out;
    },
  };
}
