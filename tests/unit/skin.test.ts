import { describe, expect, it } from 'vitest';
import type { Area, MaskTarget, Point } from '../../src/core/face/mask';
import { focusPoints } from '../../src/core/face/focus';
import { buildRegionMask } from '../../src/core/face/regions';
import { BROWS, FACE_OVAL, makeFace, MIDLINE, readFace, type Face, type FaceParts } from '../../src/core/face/scan';
import { closeSmallHoles, skinArea, skinLikeness, spotGuard, underEyeShape } from '../../src/core/face/skin';

const SIZE = 240;
const at = (mask: Uint8Array, u: number, v: number) => mask[Math.round(v * SIZE) * SIZE + Math.round(u * SIZE)];

/** A lens shape, like an open eye or a mouth, with `count` points starting at the left corner and going along the bottom. */
function lens(cx: number, cy: number, halfW: number, halfH: number, count: number): Point[] {
  return Array.from({ length: count }, (_, i): Point => {
    const t = (i / count) * Math.PI * 2 + Math.PI;
    return [cx + Math.cos(t) * halfW, cy - Math.sin(t) * halfH];
  });
}

/** An oval face outline with as many points as the model gives, from the top of the forehead, the chin halfway. */
function oval(cx: number, cy: number, rx: number, ry: number): Point[] {
  return Array.from({ length: FACE_OVAL.length }, (_, i): Point => {
    const t = (i / FACE_OVAL.length) * Math.PI * 2;
    return [cx + Math.sin(t) * rx, cy - Math.cos(t) * ry];
  });
}

/** A face filling most of the grid: eyes at a third, the mouth low, the nose down the middle. */
function face(): Face {
  const parts: FaceParts = {
    eyes: [lens(0.37, 0.4, 0.06, 0.022, 16), lens(0.63, 0.4, 0.06, 0.022, 16)],
    irises: [],
    innerLips: lens(0.5, 0.68, 0.07, 0.005, 20),
    outerLips: lens(0.5, 0.68, 0.09, 0.03, 20),
    brows: [lens(0.37, 0.33, 0.07, 0.01, 10), lens(0.63, 0.33, 0.07, 0.01, 10)],
    midline: [
      [0.5, 0.22],
      [0.5, 0.38],
      [0.5, 0.42],
      [0.5, 0.46],
      [0.5, 0.5],
      [0.5, 0.53],
      [0.5, 0.55],
      [0.5, 0.57],
      [0.5, 0.78],
    ],
  };
  return makeFace(oval(0.5, 0.5, 0.25, 0.34), parts);
}

const SKIN: [number, number, number] = [220, 168, 140];
const HAIR: [number, number, number] = [60, 40, 26];

/** The photo as the mask grid sees it: skin everywhere, with hair over the top of the forehead. */
function photo(paint: (u: number, v: number) => [number, number, number] = (_u, v) => (v < 0.24 ? HAIR : SKIN)): MaskTarget {
  const read = (area: Area) => {
    const out = new Uint8ClampedArray(area.w * area.h * 4);
    for (let y = 0; y < area.h; y++) {
      for (let x = 0; x < area.w; x++) {
        const c = paint((x + area.x + 0.5) / SIZE, (y + area.y + 0.5) / SIZE);
        out.set([...c, 255], (y * area.w + x) * 4);
      }
    }
    return out;
  };
  return {
    w: SIZE,
    h: SIZE,
    color: read,
    luma: (area) => {
      const rgba = read(area);
      const out = new Float32Array(area.w * area.h);
      for (let i = 0; i < out.length; i++) out[i] = (0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2]) / 255;
      return out;
    },
  };
}

describe('landmark lists of the skin', () => {
  it('follow the brows and the middle of the model', async () => {
    const { FaceLandmarker } = await import('@mediapipe/tasks-vision');
    const points = (links: { start: number; end: number }[]) => new Set(links.flatMap((l) => [l.start, l.end]));
    expect(new Set(BROWS[0])).toEqual(points(FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW));
    expect(new Set(BROWS[1])).toEqual(points(FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW));
    const mesh = new Set(FaceLandmarker.FACE_LANDMARKS_TESSELATION.map((l) => `${Math.min(l.start, l.end)}-${Math.max(l.start, l.end)}`));
    // The bridge of the nose runs point to point. Forehead and chin are single points away from it.
    for (let i = 2; i < MIDLINE.length - 1; i++) {
      const [a, b] = [MIDLINE[i - 1], MIDLINE[i]].sort((x, y) => x - y);
      expect(mesh.has(`${a}-${b}`)).toBe(true);
    }
  });

  it('are read with the rest of the face', () => {
    const f = readFace((i) => [i / 1000, i / 1000]);
    expect(f.parts.brows?.[0][0]).toEqual([0.07, 0.07]);
    expect(f.parts.midline?.length).toBe(MIDLINE.length);
  });
});

describe('skin', () => {
  it('covers the cheeks and the forehead, not the eyes, the brows, the lips, the hair or the background', () => {
    const mask = buildRegionMask([face()], 'skin', photo())!;
    expect(at(mask, 0.35, 0.55)).toBeGreaterThan(230);
    expect(at(mask, 0.5, 0.28)).toBeGreaterThan(200);
    expect(at(mask, 0.37, 0.4)).toBe(0);
    expect(at(mask, 0.37, 0.33)).toBeLessThan(20);
    expect(at(mask, 0.5, 0.68)).toBe(0);
    expect(at(mask, 0.5, 0.19)).toBeLessThan(20);
    expect(at(mask, 0.1, 0.5)).toBe(0);
  });

  it('keeps a pimple as skin', () => {
    const red = (u: number, v: number): [number, number, number] =>
      Math.hypot(u - 0.35, v - 0.55) < 0.012 ? [200, 95, 80] : v < 0.24 ? HAIR : SKIN;
    const mask = buildRegionMask([face()], 'skin', photo(red))!;
    expect(at(mask, 0.35, 0.55)).toBeGreaterThan(200);
  });

  it('finds no skin without a face', () => {
    expect(buildRegionMask([], 'skin', photo())).toBeNull();
  });

  it('knows skin from a darker or a grayer color', () => {
    const n = 400;
    const rgba = new Uint8ClampedArray(n * 4);
    const shape = new Float32Array(n).fill(1);
    for (let i = 0; i < n; i++) rgba.set([...SKIN, 255], i * 4);
    rgba.set([...HAIR, 255], 0);
    rgba.set([120, 140, 150, 255], 4);
    rgba.set([215, 120, 105, 255], 8);
    const like = skinLikeness(rgba, shape)!;
    expect(like[10]).toBeCloseTo(1, 2);
    expect(like[0]).toBeLessThan(0.05);
    expect(like[1]).toBeLessThan(0.05);
    expect(like[2]).toBeGreaterThan(0.5);
  });

  it('closes small holes and keeps large ones', () => {
    const w = 80;
    const shape = new Float32Array(w * w).fill(1);
    const hole = (cx: number, cy: number, r: number) => {
      for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) if (Math.hypot(x - cx, y - cy) < r) shape[y * w + x] = 0;
    };
    hole(20, 20, 2);
    hole(55, 55, 14);
    const closed = closeSmallHoles(shape, w, w, 4);
    expect(closed[20 * w + 20]).toBeGreaterThan(0.9);
    expect(closed[55 * w + 55]).toBe(0);
  });
});

describe('under the eyes', () => {
  it('lies below each eye, clear of the lashes', () => {
    const mask = buildRegionMask([face()], 'undereye', photo())!;
    expect(at(mask, 0.37, 0.45)).toBeGreaterThan(150);
    expect(at(mask, 0.63, 0.45)).toBeGreaterThan(150);
    expect(at(mask, 0.37, 0.4)).toBeLessThan(40);
    expect(at(mask, 0.37, 0.36)).toBe(0);
    expect(at(mask, 0.37, 0.55)).toBe(0);
  });

  it('is deepest away from the corners', () => {
    const eye = lens(100, 100, 30, 10, 16);
    const shape = underEyeShape(eye);
    const bottom = shape.slice(9);
    const depth = (p: Point) => p[1] - 100;
    expect(Math.max(...bottom.map(depth))).toBeGreaterThan(depth(bottom[0]) + 5);
    expect(Math.min(...shape.map(depth))).toBeGreaterThan(0);
  });
});

describe('spots of light', () => {
  it('fall on the cheekbones and the bridge of the nose, inside the skin', () => {
    const mask = buildRegionMask([face()], 'glow', photo())!;
    const cheek = Math.max(...[0.3, 0.32, 0.34].flatMap((u) => [0.47, 0.49, 0.51].map((v) => at(mask, u, v))));
    expect(cheek).toBeGreaterThan(100);
    expect(at(mask, 0.5, 0.48)).toBeGreaterThan(100);
    expect(at(mask, 0.37, 0.4)).toBe(0);
    expect(at(mask, 0.1, 0.5)).toBe(0);
  });
});

describe('where Manchas does not look', () => {
  it('leaves out the nostrils, not the cheeks', () => {
    const f = face();
    const target = { w: SIZE, h: SIZE };
    const area = skinArea(f, target);
    const guard = spotGuard(f, target, area);
    const g = (u: number, v: number) => guard[(Math.round(v * SIZE) - area.y) * area.w + Math.round(u * SIZE) - area.x];
    expect(g(0.5, 0.61)).toBeGreaterThan(0.9);
    expect(g(0.35, 0.55)).toBe(0);
  });
});

describe('framing the skin', () => {
  it('frames the whole face for the skin and the eyes for the dark circles', () => {
    const [skin] = focusPoints([face()], 'skin');
    expect(skin.length).toBe(FACE_OVAL.length);
    const [under] = focusPoints([face()], 'undereye');
    expect(Math.max(...under.map((p) => p[1]))).toBeGreaterThan(0.44);
  });
});
