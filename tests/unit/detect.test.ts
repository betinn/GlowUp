import { describe, expect, it } from 'vitest';
import { findBlemish, hasStrongEdge, pickOffset, type Patch } from '../../src/tools/heal/detect';

function skin(size: number, paint?: (x: number, y: number) => [number, number, number] | null): Patch {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = paint?.(x, y) ?? [205, 165, 140];
      const n = ((x * 31 + y * 17) % 7) - 3;
      data.set([c[0] + n, c[1] + n, c[2] + n, 255], (y * size + x) * 4);
    }
  }
  return { data, w: size, h: size };
}

const spot = (cx: number, cy: number, r: number) => (x: number, y: number) =>
  Math.hypot(x - cx, y - cy) < r ? ([170, 90, 80] as [number, number, number]) : null;

describe('blemish detection', () => {
  it('finds a spot near the touch and fits its size', () => {
    const found = findBlemish(skin(96, spot(54, 42, 6)), 30);
    expect(found).not.toBeNull();
    expect(found!.x).toBeCloseTo(54, 0);
    expect(found!.y).toBeCloseTo(42, 0);
    expect(found!.r).toBeGreaterThan(6);
    expect(found!.r).toBeLessThan(17);
  });

  it('returns null on even skin', () => {
    expect(findBlemish(skin(96), 30)).toBeNull();
  });

  it('ignores spots outside the search radius', () => {
    expect(findBlemish(skin(96, spot(85, 85, 3)), 16)).toBeNull();
  });

  it('refuses long edges, which are not blemishes', () => {
    const edge = skin(96, (x) => (x > 48 ? [60, 40, 30] : null));
    expect(findBlemish(edge, 30)).toBeNull();
  });
});

describe('contours', () => {
  it('sees hair crossing the brush, and calm skin as calm', () => {
    const hair = skin(96, (x) => (x > 60 ? [50, 40, 35] : null));
    expect(hasStrongEdge(hair, 20)).toBe(true);
    expect(hasStrongEdge(hair, 8)).toBe(false);
    expect(hasStrongEdge(skin(96), 20)).toBe(false);
  });
});

describe('texture source choice', () => {
  it('avoids another blemish and stays away from the target', () => {
    const other = spot(64 + 24, 64, 7);
    const patch = skin(128, (x, y) => other(x, y) ?? spot(64, 64, 8)(x, y));
    const { dx, dy } = pickOffset(patch, 64, 64, 10);
    expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(21);
    const hitsOther = Math.hypot(64 + dx - 88, 64 + dy - 64) < 12;
    expect(hitsOther).toBe(false);
  });

  it('prefers calm skin over an edge', () => {
    const patch = skin(128, (x) => (x > 92 ? [50, 40, 35] : null));
    const { dx } = pickOffset(patch, 64, 64, 10);
    expect(dx).toBeLessThan(18);
  });
});
