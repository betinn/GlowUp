import { describe, expect, it } from 'vitest';
import { buildLut, curveFn, LUT_CATEGORIES, LUTS } from '../../src/presets/luts';

describe('LUT catalog', () => {
  it('has at least 30 filters in about 10 categories', () => {
    expect(LUTS.length).toBeGreaterThanOrEqual(30);
    expect(LUT_CATEGORIES.length).toBe(10);
    for (const c of LUT_CATEGORIES) expect(LUTS.filter((l) => l.category === c).length).toBeGreaterThanOrEqual(3);
  });

  it('has unique ids and names', () => {
    expect(new Set(LUTS.map((l) => l.id)).size).toBe(LUTS.length);
    expect(new Set(LUTS.map((l) => l.name)).size).toBe(LUTS.length);
  });

  it('builds finite, in-range tables of the right size', () => {
    for (const l of LUTS) {
      const data = buildLut(l, 9);
      expect(data.length).toBe(9 ** 3 * 4);
      for (const v of data) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('makes every filter different from no filter', () => {
    for (const l of LUTS) {
      const data = buildLut(l, 5);
      let diff = 0;
      let i = 0;
      for (let b = 0; b < 5; b++) {
        for (let g = 0; g < 5; g++) {
          for (let r = 0; r < 5; r++) {
            diff += Math.abs(data[i] - r / 4) + Math.abs(data[i + 1] - g / 4) + Math.abs(data[i + 2] - b / 4);
            i += 4;
          }
        }
      }
      expect(diff / 125).toBeGreaterThan(0.01);
    }
  });

  it('keeps black and white filters neutral', () => {
    for (const l of LUTS.filter((x) => x.id === 'prata' || x.id === 'carvao')) {
      const data = buildLut(l, 5);
      for (let i = 0; i < data.length; i += 4) {
        expect(data[i]).toBeCloseTo(data[i + 1], 5);
        expect(data[i]).toBeCloseTo(data[i + 2], 5);
      }
    }
  });
});

describe('curve', () => {
  it('passes through its points and stays monotone', () => {
    const f = curveFn([
      [0, 0.1],
      [0.5, 0.4],
      [1, 0.9],
    ]);
    expect(f(0)).toBeCloseTo(0.1);
    expect(f(0.5)).toBeCloseTo(0.4);
    expect(f(1)).toBeCloseTo(0.9);
    let last = -1;
    for (let x = 0; x <= 1; x += 0.01) {
      expect(f(x)).toBeGreaterThanOrEqual(last);
      last = f(x);
    }
  });
});
