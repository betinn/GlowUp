import { describe, expect, it } from 'vitest';
import type { Point } from '../../src/core/face/mask';
import { buildRegionMask, lipReach } from '../../src/core/face/regions';
import type { MaskTarget } from '../../src/core/face/mask';
import { EYES, FACE_OVAL, INNER_LIPS, IRISES, makeFace, OUTER_LIPS, readFace, type FaceParts } from '../../src/core/face/scan';

const SIZE = 200;
const target = { w: SIZE, h: SIZE };
const at = (mask: Uint8Array, u: number, v: number) => mask[Math.round(v * SIZE) * SIZE + Math.round(u * SIZE)];

/** A lens shape, like an open eye or a mouth, with `count` points starting at the left corner. */
function lens(cx: number, cy: number, halfW: number, halfH: number, count: number): Point[] {
  return Array.from({ length: count }, (_, i): Point => {
    const t = (i / count) * Math.PI * 2 + Math.PI;
    return [cx + Math.cos(t) * halfW, cy - Math.sin(t) * halfH];
  });
}

/** Four points on a circle. */
const ring = (cx: number, cy: number, r: number): Point[] => [
  [cx + r, cy],
  [cx, cy - r],
  [cx - r, cy],
  [cx, cy + r],
];

function face(gap: number, shift = 0): ReturnType<typeof makeFace> {
  const parts: FaceParts = {
    eyes: [lens(0.3 + shift, 0.3, 0.08, 0.04, 16), lens(0.7 + shift, 0.3, 0.08, 0.04, 16)],
    irises: [ring(0.3 + shift, 0.3, 0.035), ring(0.7 + shift, 0.3, 0.035)],
    innerLips: lens(0.5 + shift, 0.7, 0.12, (gap * 0.24) / 2, 20),
    outerLips: lens(0.5 + shift, 0.7, 0.15, 0.08, 20),
  };
  return makeFace(ring(0.5 + shift, 0.5, 0.4), parts);
}

describe('landmark lists', () => {
  it('follow the contours of the model', async () => {
    const { FaceLandmarker } = await import('@mediapipe/tasks-vision');
    const points = (links: { start: number; end: number }[]) => new Set(links.flatMap((l) => [l.start, l.end]));
    expect(new Set(EYES[0])).toEqual(points(FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE));
    expect(new Set(EYES[1])).toEqual(points(FaceLandmarker.FACE_LANDMARKS_LEFT_EYE));
    expect(new Set(IRISES[0])).toEqual(points(FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS));
    expect(new Set(IRISES[1])).toEqual(points(FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS));
    expect(new Set([...INNER_LIPS, ...OUTER_LIPS])).toEqual(points(FaceLandmarker.FACE_LANDMARKS_LIPS));
  });

  it('read every shape from the list', () => {
    const f = readFace((i) => [i / 1000, i / 1000]);
    expect(f.outline.length).toBe(FACE_OVAL.length);
    expect(f.parts.eyes[1][0]).toEqual([0.263, 0.263]);
    expect(f.parts.irises[0].length).toBe(4);
    expect(f.parts.innerLips.length).toBe(f.parts.outerLips.length);
  });
});

describe('iris and white of the eye', () => {
  it('splits the eye between the two regions', () => {
    const iris = buildRegionMask([face(0.3)], 'iris', target)!;
    const sclera = buildRegionMask([face(0.3)], 'sclera', target)!;
    expect(at(iris, 0.3, 0.3)).toBe(255);
    expect(at(sclera, 0.3, 0.3)).toBe(0);
    expect(at(iris, 0.36, 0.3)).toBe(0);
    expect(at(sclera, 0.36, 0.3)).toBeGreaterThan(200);
  });

  it('keeps out what is not the eye', () => {
    const iris = buildRegionMask([face(0.3)], 'iris', target)!;
    for (const [u, v] of [
      [0.5, 0.5],
      [0.5, 0.7],
      [0.05, 0.05],
    ]) {
      expect(at(iris, u, v)).toBe(0);
    }
  });

  it('cuts the iris at the eyelid', () => {
    const narrow = makeFace(ring(0.5, 0.5, 0.4), {
      eyes: [lens(0.3, 0.3, 0.08, 0.012, 16)],
      irises: [ring(0.3, 0.3, 0.035)],
      innerLips: [],
      outerLips: [],
    });
    const iris = buildRegionMask([narrow], 'iris', target)!;
    expect(at(iris, 0.3, 0.3)).toBeGreaterThan(200);
    expect(at(iris, 0.3, 0.33)).toBe(0);
  });

  it('keeps the circle round on a photo that is not square', () => {
    const wide = { w: 400, h: 100 };
    const eye = makeFace(ring(0.5, 0.5, 0.4), {
      eyes: [lens(0.5, 0.5, 0.1, 0.4, 16)],
      irises: [ring(0.5, 0.5, 0.05).map(([u, v]): Point => [u, 0.5 + (v - 0.5) * 4])],
      innerLips: [],
      outerLips: [],
    });
    const mask = buildRegionMask([eye], 'iris', wide)!;
    const row = Array.from({ length: 400 }, (_, x) => mask[50 * 400 + x]).filter((v) => v > 127).length;
    const column = Array.from({ length: 100 }, (_, y) => mask[y * 400 + 200]).filter((v) => v > 127).length;
    expect(Math.abs(row - column)).toBeLessThanOrEqual(3);
  });

  it('adds every face and survives a face cut by the edge of the photo', () => {
    const both = buildRegionMask([face(0.3), face(0.3, 0.2)], 'iris', target)!;
    expect(at(both, 0.3, 0.3)).toBe(255);
    expect(at(both, 0.5, 0.3)).toBe(255);
    expect(at(both, 0.9, 0.3)).toBe(255);
    expect(buildRegionMask([face(0.3, 0.65)], 'iris', target)).not.toBeNull();
    expect(buildRegionMask([face(0.3, 5)], 'iris', target)).toBeNull();
  });

  it('holds a small iris', () => {
    const small = makeFace(ring(0.5, 0.5, 0.04), {
      eyes: [lens(0.5, 0.5, 0.02, 0.01, 16)],
      irises: [ring(0.5, 0.5, 0.008)],
      innerLips: [],
      outerLips: [],
    });
    expect(at(buildRegionMask([small], 'iris', target)!, 0.5, 0.5)).toBeGreaterThan(150);
  });
});

describe('iris from the photo', () => {
  const SKIN: [number, number, number] = [205, 150, 125];
  const WHITE: [number, number, number] = [215, 205, 200];
  const IRIS: [number, number, number] = [70, 95, 105];
  const LASH: [number, number, number] = [75, 45, 32];

  /**
   * One eye at (0.3, 0.3): skin around, the white inside the lids, and the iris a little left and below
   * where the model puts it, as when the eye looks aside. Lashes along the upper lid.
   */
  function photo(iris: Point, irisColor = IRIS, white = WHITE, skin = SKIN): MaskTarget {
    const paint = (u: number, v: number): [number, number, number] => {
      if (Math.abs(v - (0.3 - 0.036)) < 0.006 && Math.abs(u - 0.3) < 0.07) return LASH;
      const inEye = ((u - 0.3) / 0.08) ** 2 + ((v - 0.3) / 0.04) ** 2 < 1;
      if (!inEye) return skin;
      return Math.hypot(u - iris[0], v - iris[1]) < 0.035 ? irisColor : white;
    };
    const read = (area: { x: number; y: number; w: number; h: number }) => {
      const out = new Uint8ClampedArray(area.w * area.h * 4);
      for (let y = 0; y < area.h; y++) {
        for (let x = 0; x < area.w; x++) out.set([...paint((x + area.x + 0.5) / SIZE, (y + area.y + 0.5) / SIZE), 255], (y * area.w + x) * 4);
      }
      return out;
    };
    return {
      ...target,
      color: read,
      luma: (area) => {
        const rgba = read(area);
        const out = new Float32Array(area.w * area.h);
        for (let i = 0; i < out.length; i++) out[i] = (0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2]) / 255;
        return out;
      },
    };
  }

  it('follows the iris the photo shows, also where the circle of the model misses it', () => {
    const mask = buildRegionMask([face(0)], 'iris', photo([0.288, 0.31]))!;
    // The part of the iris left of and below the circle of the model.
    expect(at(mask, 0.26, 0.315)).toBeGreaterThan(200);
    expect(at(mask, 0.288, 0.31)).toBeGreaterThan(240);
    // The white the circle of the model covers, on the other side.
    expect(at(mask, 0.33, 0.29)).toBeLessThan(40);
  });

  it('leaves out the skin around and the lashes over the iris', () => {
    const mask = buildRegionMask([face(0)], 'iris', photo([0.3, 0.3]))!;
    expect(at(mask, 0.3, 0.3)).toBeGreaterThan(240);
    expect(at(mask, 0.3, 0.264)).toBeLessThan(60);
    expect(at(mask, 0.3, 0.338)).toBeLessThan(40);
  });

  it('falls back to the shape of the model when the photo cannot tell the iris apart', () => {
    const dark: [number, number, number] = [80, 60, 50];
    const mask = buildRegionMask([face(0)], 'iris', photo([0.288, 0.31], dark, dark, dark))!;
    expect(at(mask, 0.3, 0.3)).toBeGreaterThan(200);
    expect(at(mask, 0.26, 0.315)).toBeLessThan(60);
  });
});

describe('teeth', () => {
  it('finds no teeth in a closed mouth', () => {
    expect(lipReach(lens(0.5, 0.7, 0.12, 0.002, 20))).toBe(0);
    expect(buildRegionMask([face(0.01)], 'teeth', target)).toBeNull();
    expect(buildRegionMask([], 'teeth', target)).toBeNull();
  });

  it('opens with the mouth, up to a limit', () => {
    const half = lipReach(lens(0.5, 0.7, 0.12, 0.012, 20));
    const open = lipReach(lens(0.5, 0.7, 0.12, 0.03, 20));
    expect(half).toBeGreaterThan(0);
    expect(open).toBeGreaterThan(half);
    expect(lipReach(lens(0.5, 0.7, 0.12, 0.06, 20))).toBe(open);
  });

  it('goes a bit past the inner contour and stops before the outer one', () => {
    const teeth = buildRegionMask([face(0.3)], 'teeth', target)!;
    expect(at(teeth, 0.5, 0.7)).toBeGreaterThan(200);
    // Inner lip at 0.736, outer lip at 0.78.
    expect(at(teeth, 0.5, 0.74)).toBeGreaterThan(100);
    expect(at(teeth, 0.5, 0.775)).toBe(0);
    expect(at(teeth, 0.3, 0.3)).toBe(0);
  });

  it('keeps inside the outer lips even with a photo that pulls the edge out', () => {
    const flat = { ...target, luma: (a: { w: number; h: number }) => new Float32Array(a.w * a.h).fill(0.5) };
    const teeth = buildRegionMask([face(0.3)], 'teeth', flat)!;
    expect(at(teeth, 0.5, 0.79)).toBe(0);
    expect(at(teeth, 0.5, 0.7)).toBeGreaterThan(200);
  });
});
