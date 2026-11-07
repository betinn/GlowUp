import { describe, expect, it } from 'vitest';
import type { Point } from '../../src/core/face/mask';
import { buildRegionMask, lipReach } from '../../src/core/face/regions';
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
