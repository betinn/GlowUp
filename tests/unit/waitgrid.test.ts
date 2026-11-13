import { describe, expect, it } from 'vitest';
import { lastWave, pieces } from '../../src/ui/waitgrid';

describe('pieces of a waiting photo', () => {
  it('covers the photo once, with no gap and no overlap', () => {
    for (const [w, h] of [
      [360, 480],
      [480, 360],
      [300, 300],
      [200, 900],
      [1200, 300],
    ]) {
      const list = pieces(w, h);
      const area = list.reduce((sum, p) => sum + p.w * p.h, 0);
      expect(area).toBeCloseTo(1, 9);
      for (const p of list) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.x + p.w).toBeLessThanOrEqual(1 + 1e-9);
        expect(p.y + p.h).toBeLessThanOrEqual(1 + 1e-9);
      }
      const places = new Set(list.map((p) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`));
      expect(places.size).toBe(list.length);
    }
  });

  it('has four pieces across the short side, and close to square ones', () => {
    expect(pieces(360, 480)).toHaveLength(4 * 5);
    expect(pieces(480, 360)).toHaveLength(5 * 4);
    expect(pieces(300, 300)).toHaveLength(16);
  });

  it('stops at seven along a very long photo', () => {
    expect(pieces(100, 2000)).toHaveLength(4 * 7);
    expect(pieces(2000, 100)).toHaveLength(7 * 4);
  });

  it('moves as a wave from the top left corner to the opposite one', () => {
    const list = pieces(360, 480);
    expect(list[0].wave).toBe(0);
    expect(lastWave(list)).toBe(3 + 4);
    expect(list.at(-1)!.wave).toBe(lastWave(list));
  });

  it('gives each piece a small move of its own, the same every time', () => {
    const a = pieces(360, 480);
    const b = pieces(360, 480);
    expect(a).toEqual(b);
    for (const p of a) {
      expect(Math.abs(p.dx)).toBeLessThanOrEqual(0.15);
      expect(Math.abs(p.dy)).toBeLessThanOrEqual(0.15);
      expect(Math.abs(p.turn)).toBeLessThanOrEqual(6);
    }
    expect(new Set(a.map((p) => p.dx.toFixed(4))).size).toBeGreaterThan(a.length / 2);
  });

  it('has no pieces for a photo with no size', () => {
    expect(pieces(0, 100)).toEqual([]);
    expect(pieces(100, Number.NaN)).toEqual([]);
  });
});
