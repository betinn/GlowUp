import { describe, expect, it } from 'vitest';
import type { Area, MaskTarget, Point } from '../../src/core/face/mask';
import { buildRegionMask } from '../../src/core/face/regions';
import { makeFace, type FaceParts } from '../../src/core/face/scan';

/**
 * A drawn smile: skin, red lips, and between them yellow teeth under a strip of gum, the dark of the mouth
 * and a tongue. The teeth tool must take the teeth and nothing else.
 */
const SIZE = 400;
type RGB = [number, number, number];
const SKIN: RGB = [205, 155, 135];
const LIPS: RGB = [180, 90, 95];
const DARK: RGB = [28, 14, 14];
const GUM: RGB = [200, 105, 115];
const TONGUE: RGB = [170, 80, 85];
const TEETH: RGB = [215, 195, 140];
/** The same teeth at the back of the mouth, in shadow. */
const BACK_TEETH: RGB = [105, 95, 68];
const GLINT: RGB = [250, 248, 245];

/** A lens shape with `count` points starting at the left corner, as the lips are listed. */
function lens(cx: number, cy: number, halfW: number, halfH: number, count: number): Point[] {
  return Array.from({ length: count }, (_, i): Point => {
    const t = (i / count) * Math.PI * 2 + Math.PI;
    return [cx + Math.cos(t) * halfW, cy - Math.sin(t) * halfH];
  });
}

const ring = (cx: number, cy: number, r: number): Point[] => [
  [cx + r, cy],
  [cx, cy - r],
  [cx - r, cy],
  [cx, cy + r],
];

/** The inner contour reaches from 0.664 to 0.736, the outer one from 0.62 to 0.78. */
const parts: FaceParts = {
  eyes: [lens(0.3, 0.3, 0.08, 0.04, 16), lens(0.7, 0.3, 0.08, 0.04, 16)],
  irises: [ring(0.3, 0.3, 0.035), ring(0.7, 0.3, 0.035)],
  innerLips: lens(0.5, 0.7, 0.12, 0.036, 20),
  outerLips: lens(0.5, 0.7, 0.15, 0.08, 20),
};
const face = makeFace(ring(0.5, 0.5, 0.4), parts);

const inLens = (u: number, v: number, cx: number, cy: number, hw: number, hh: number) => ((u - cx) / hw) ** 2 + ((v - cy) / hh) ** 2 <= 1;

interface Smile {
  teeth?: boolean;
  back?: boolean;
  glint?: boolean;
}

/** The color of the drawn smile at a point in UV. */
function paint(u: number, v: number, { teeth = true, back = false, glint = false }: Smile): RGB {
  if (inLens(u, v, 0.5, 0.7, 0.12, 0.036)) {
    if (teeth && v >= 0.676 && v < 0.708 && Math.abs(u - 0.5) < 0.085) return TEETH;
    if (teeth && back && v >= 0.676 && v < 0.706 && Math.abs(u - 0.5) >= 0.085 && Math.abs(u - 0.5) < 0.105) return BACK_TEETH;
    if (teeth && v < 0.676) return GUM;
    if (v > 0.722) return TONGUE;
    return DARK;
  }
  if (glint && Math.hypot(u - 0.5, v - 0.748) < 0.006) return GLINT;
  if (inLens(u, v, 0.5, 0.7, 0.15, 0.08)) return LIPS;
  return SKIN;
}

function target(smile: Smile = {}): MaskTarget {
  return {
    w: SIZE,
    h: SIZE,
    color(area: Area) {
      const out = new Uint8ClampedArray(area.w * area.h * 4);
      for (let y = 0; y < area.h; y++) {
        for (let x = 0; x < area.w; x++) {
          const c = paint((area.x + x + 0.5) / SIZE, (area.y + y + 0.5) / SIZE, smile);
          out.set([...c, 255], (y * area.w + x) * 4);
        }
      }
      return out;
    },
  };
}

const at = (mask: Uint8Array, u: number, v: number) => mask[Math.floor(v * SIZE) * SIZE + Math.floor(u * SIZE)];

describe('teeth from the photo', () => {
  it('takes the yellow teeth and leaves out lips, gum, tongue, the dark of the mouth and skin', () => {
    const mask = buildRegionMask([face], 'teeth', target())!;
    expect(mask).not.toBeNull();
    for (const u of [0.43, 0.47, 0.5, 0.53, 0.57]) {
      expect(at(mask, u, 0.684)).toBeGreaterThan(220);
      expect(at(mask, u, 0.7)).toBeGreaterThan(220);
    }
    // The gum over the teeth, the dark under them and the tongue.
    expect(at(mask, 0.5, 0.668)).toBeLessThan(30);
    expect(at(mask, 0.5, 0.716)).toBeLessThan(30);
    expect(at(mask, 0.5, 0.73)).toBe(0);
    // The inner side of the lips the opening holds, the lips and the skin.
    expect(at(mask, 0.5, 0.745)).toBe(0);
    expect(at(mask, 0.5, 0.655)).toBe(0);
    expect(at(mask, 0.5, 0.77)).toBe(0);
    expect(at(mask, 0.5, 0.6)).toBe(0);
    // The dark corners of the mouth, past the teeth.
    expect(at(mask, 0.6, 0.7)).toBe(0);
  });

  it('has a soft but tight edge', () => {
    const mask = buildRegionMask([face], 'teeth', target())!;
    // Across the lower edge of the teeth, at 0.708, the mask goes from full to empty in a few pixels.
    const column = Array.from({ length: 12 }, (_, i) => at(mask, 0.5, 0.702 + i / SIZE));
    expect(column[0]).toBeGreaterThan(220);
    expect(column[11]).toBeLessThan(10);
    expect(column.some((v) => v > 20 && v < 235)).toBe(true);
  });

  it('keeps the teeth at the back, in shadow', () => {
    const mask = buildRegionMask([face], 'teeth', target({ back: true }))!;
    expect(at(mask, 0.405, 0.69)).toBeGreaterThan(128);
    expect(at(mask, 0.595, 0.69)).toBeGreaterThan(128);
  });

  it('leaves out a glint on the lip', () => {
    const mask = buildRegionMask([face], 'teeth', target({ glint: true }))!;
    expect(at(mask, 0.5, 0.748)).toBe(0);
    expect(at(mask, 0.5, 0.69)).toBeGreaterThan(220);
  });

  it('finds nothing in an open mouth that shows no teeth', () => {
    expect(buildRegionMask([face], 'teeth', target({ teeth: false }))).toBeNull();
  });
});
