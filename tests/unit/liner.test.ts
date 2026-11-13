import { describe, expect, it } from 'vitest';
import { eyeLids, fitLashes, foxShapes, linerShape, smoothLine, SMOKE_PEAK } from '../../src/core/face/liner';
import type { MaskTarget, Point } from '../../src/core/face/mask';
import { buildRegionMask } from '../../src/core/face/regions';
import { makeFace, type FaceParts } from '../../src/core/face/scan';
import { lens, oval, paintedPhoto, type Color } from './face-fixtures';

const SIZE = 400;
const at = (mask: Uint8Array, u: number, v: number) => mask[Math.round(v * SIZE) * SIZE + Math.round(u * SIZE)];

/** A brow in the order of the model: along the top from the outer end, then back along the bottom. */
function brow(cx: number, cy: number, halfW: number, halfH: number, outerAt: -1 | 1): Point[] {
  const xs = [1, 0.5, 0, -0.5, -1].map((k) => cx + k * outerAt * halfW);
  return [...xs.map((x): Point => [x, cy - halfH]), ...[...xs].reverse().map((x): Point => [x, cy + halfH])];
}

/**
 * An eye in the order of the model, from its outer corner along the lower lid. `lens` starts at the left
 * corner, which is the outer one of the eye on the left of the photo; the eye on the right is mirrored.
 */
function eye(cx: number, outerAt: -1 | 1): Point[] {
  const list = lens(cx, 0.4, 0.06, 0.022, 16);
  return outerAt === -1 ? list : list.map(([x, y]): Point => [2 * cx - x, y]);
}

const parts: FaceParts = {
  eyes: [eye(0.37, -1), eye(0.63, 1)],
  irises: [],
  innerLips: lens(0.5, 0.68, 0.07, 0.015, 20),
  outerLips: lens(0.5, 0.68, 0.09, 0.035, 20),
  brows: [brow(0.37, 0.31, 0.07, 0.01, -1), brow(0.63, 0.31, 0.07, 0.01, 1)],
};
const face = (more: Partial<FaceParts> = {}) => makeFace(oval(0.5, 0.5, 0.26, 0.36), { ...parts, ...more });

const SKIN: Color = [220, 168, 140];
const WHITE: Color = [225, 220, 215];
const LASH: Color = [40, 30, 28];
const BROW: Color = [95, 65, 45];
const LENS: Color = [30, 40, 70];

const inLens = (u: number, v: number, cx: number, cy: number, a: number, b: number) => ((u - cx) / a) ** 2 + ((v - cy) / b) ** 2 < 1;

/** Skin, two open eyes with a dark line of lashes on top, and brows. `over` covers some of it. */
const eyed = (over?: (u: number, v: number) => Color | null): MaskTarget =>
  paintedPhoto(SIZE, (u, v) => {
    const covered = over?.(u, v);
    if (covered) return covered;
    for (const cx of [0.37, 0.63]) {
      if (inLens(u, v, cx, 0.4, 0.06, 0.022)) return WHITE;
      if (v < 0.4 && inLens(u, v, cx, 0.4, 0.061, 0.026)) return LASH;
      if (inLens(u, v, cx, 0.31, 0.075, 0.012)) return BROW;
    }
    return SKIN;
  });

describe('the lids of an eye', () => {
  const lids = eyeLids(eye(0.37, -1).map(([x, y]): Point => [x * SIZE, y * SIZE]), brow(0.37, 0.31, 0.07, 0.01, -1).map(([x, y]): Point => [x * SIZE, y * SIZE]));

  it('run from the inner corner to the outer one, with up toward the brow', () => {
    expect(lids.upper[0][0]).toBeCloseTo(0.43 * SIZE, 1);
    expect(lids.upper.at(-1)![0]).toBeCloseTo(0.31 * SIZE, 1);
    expect(lids.out[0]).toBeLessThan(-0.99);
    expect(lids.up[1]).toBeLessThan(-0.99);
    // Halfway along, the brow is some 0.07 of the photo over the lid.
    expect(lids.lidHeight(0.5) / SIZE).toBeGreaterThan(0.05);
    expect(lids.lidHeight(0.5) / SIZE).toBeLessThan(0.08);
  });

  it('are curves through the points of the model', () => {
    const line = smoothLine([[0, 0], [1, 1], [2, 0]], 4);
    expect(line).toHaveLength(9);
    expect(line[0]).toEqual([0, 0]);
    expect(line.at(-1)).toEqual([2, 0]);
    expect(line[4][1]).toBeCloseTo(1, 5);
  });

  it('move onto the line of lashes of the photo, and stay without one', () => {
    // A finer grid, so the line of lashes has a few pixels to it.
    const S = 1600;
    const lift = 0.0042;
    const photo = paintedPhoto(S, (u, v) => {
      if (inLens(u, v, 0.37, 0.4, 0.06, 0.022)) return WHITE;
      if (v < 0.4 && inLens(u, v + lift, 0.37, 0.4, 0.061, 0.025) && !inLens(u, v + lift, 0.37, 0.4, 0.06, 0.022)) return LASH;
      return SKIN;
    });
    const grid = (list: readonly Point[]) => list.map(([x, y]): Point => [x * S, y * S]);
    const fine = eyeLids(grid(eye(0.37, -1)), grid(brow(0.37, 0.31, 0.07, 0.01, -1)));
    const area = { x: 0, y: 0, w: S, h: S };
    const moved = fitLashes(fine, photo.luma!(area), area);
    const middle = Math.floor(fine.upper.length / 2);
    // The lashes were drawn 0.0057 of the photo over the contour, in the middle.
    const by = (fine.upper[middle][1] - moved.upper[middle][1]) / S;
    expect(by).toBeGreaterThan(0.004);
    expect(by).toBeLessThan(0.0075);
    // The corners move half as much.
    expect((fine.upper[0][1] - moved.upper[0][1]) / S).toBeCloseTo(by / 2, 3);
    const plain = paintedPhoto(SIZE, () => SKIN);
    const whole = { x: 0, y: 0, w: SIZE, h: SIZE };
    expect(fitLashes(lids, plain.luma!(whole), whole).upper).toEqual(lids.upper);
  });

  it('give the fox a longer wing, lifted more than the classic one', () => {
    const classic = linerShape(lids);
    const fox = foxShapes(lids);
    const outermost = (shape: readonly Point[]) => Math.min(...shape.map((p) => p[0]));
    const highest = (shape: readonly Point[]) => Math.min(...shape.map((p) => p[1]));
    expect(outermost(fox.top)).toBeLessThan(outermost(classic));
    expect(highest(fox.top)).toBeLessThan(highest(classic) - 0.005 * SIZE);
    expect(fox.angle).toBeGreaterThanOrEqual(18);
    expect(fox.angle).toBeLessThanOrEqual(38);
  });
});

describe('Delineado', () => {
  it('lies on the upper lashes with a wing past the outer corner, off the eye, the lid and the brow', () => {
    const mask = buildRegionMask([face()], 'liner', eyed())!;
    for (const [cx, out] of [[0.37, -1], [0.63, 1]] as const) {
      // Just over the lashes, in the middle of the lid, where the line is thin.
      expect(Math.max(at(mask, cx, 0.372), at(mask, cx, 0.37))).toBeGreaterThan(50);
      // In the wing, past the corner.
      expect(at(mask, cx + out * 0.068, 0.393)).toBeGreaterThan(150);
      expect(at(mask, cx, 0.4)).toBe(0);
      expect(at(mask, cx, 0.35)).toBe(0);
      expect(at(mask, cx, 0.31)).toBe(0);
      expect(at(mask, cx, 0.43)).toBe(0);
    }
  });

  it('leaves out an eye behind dark lenses', () => {
    const glasses = (u: number, v: number) => (Math.abs(v - 0.39) < 0.05 && Math.abs(u - 0.37) < 0.1 ? LENS : null);
    const mask = buildRegionMask([face()], 'liner', eyed(glasses))!;
    expect(at(mask, 0.37, 0.374)).toBe(0);
    expect(at(mask, 0.37 - 0.068, 0.393)).toBe(0);
    // The other eye is bare and keeps its line.
    expect(at(mask, 0.63 + 0.068, 0.393)).toBeGreaterThan(150);
    const both = (u: number, v: number) => (Math.abs(v - 0.39) < 0.05 && Math.abs(u - 0.5) < 0.24 ? LENS : null);
    expect(buildRegionMask([face()], 'liner', eyed(both))).toBeNull();
  });

  it('finds nothing on a face without eyes', () => {
    for (const region of ['eyeline', 'liner', 'fox'] as const) {
      expect(buildRegionMask([face({ eyes: [] })], region, eyed())).toBeNull();
      expect(buildRegionMask([], region, eyed())).toBeNull();
    }
  });
});

describe('Fox eye', () => {
  const mask = buildRegionMask([face()], 'fox', eyed())!;
  const smoke = Math.round(SMOKE_PEAK * 255);

  it('draws the line at full strength and the smoke at half, on the outer corner only', () => {
    for (const [cx, out] of [[0.37, -1], [0.63, 1]] as const) {
      // The long wing, past the corner and up.
      expect(at(mask, cx + out * 0.065, 0.39)).toBeGreaterThan(160);
      // Smoke over the outer part of the lid, never as strong as the line.
      const lid = at(mask, cx + out * 0.035, 0.36);
      expect(lid).toBeGreaterThan(smoke * 0.5);
      expect(lid).toBeLessThanOrEqual(smoke + 2);
      // The inner part of the lid, the eye, the brow and the cheek stay clear.
      expect(at(mask, cx - out * 0.04, 0.35)).toBeLessThan(20);
      expect(at(mask, cx, 0.4)).toBe(0);
      expect(at(mask, cx, 0.31)).toBeLessThan(20);
      expect(at(mask, cx, 0.46)).toBe(0);
    }
  });

  it('points the inner corner toward the nose and down', () => {
    expect(at(mask, 0.37 + 0.066, 0.402)).toBeGreaterThan(60);
    expect(at(mask, 0.63 - 0.066, 0.402)).toBeGreaterThan(60);
  });
});

describe('the reach of the brush', () => {
  it('goes around the eye, up the lid and out past the corner, with the eye left out', () => {
    const mask = buildRegionMask([face()], 'eyeline', eyed())!;
    for (const [cx, out] of [[0.37, -1], [0.63, 1]] as const) {
      expect(at(mask, cx, 0.36)).toBeGreaterThan(200);
      expect(at(mask, cx + out * 0.1, 0.37)).toBeGreaterThan(200);
      expect(at(mask, cx, 0.427)).toBeGreaterThan(120);
      expect(at(mask, cx, 0.4)).toBe(0);
      expect(at(mask, cx, 0.3)).toBe(0);
      expect(at(mask, cx, 0.5)).toBe(0);
    }
  });
});
