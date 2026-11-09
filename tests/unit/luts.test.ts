import { describe, expect, it } from 'vitest';
import { buildLut, curveFn, FILTER_CATEGORIES, FILTERS, lutById, type FilterData } from '../../src/presets/luts';

/** Names of filters and brands of other apps, in ROT13 so this file does not contain the words. */
const THIRD_PARTY = [
  'pynerqba', 'trvatunz', 'zbba', 'yner', 'ernrf', 'wha', 'wahb', 'fynhzore', 'pertr', 'yhqivt', 'nqra', 'crecrghn', 'nznen',
  'znlsnve', 'evfr', 'uhqfba', 'unsr', 'inyrapvn', 'kceb-vv', 'fvreen', 'jvyybj', 'ybsv', 'vaxjryy', 'anfuivyyr', 'fgvapx',
  'ifpb', 'cvpfneg', 'snprghar', 'zrvghf', 'erzvav', 'vafgntenz', 'gvxgbx', 'fancpung',
].map((s) => s.replace(/[a-z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 97 + 13) % 26) + 97)));

const plain = (over: Partial<FilterData> = {}): FilterData => ({ id: 'x', name: 'X', category: 'X', lut: { ops: [] }, ...over });

/** A small table made of `f`, encoded as a filter file holds it. */
function tableOf(size: number, f: (r: number, g: number, b: number) => [number, number, number]): string {
  const data = new Uint16Array(size ** 3 * 3);
  let i = 0;
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        for (const v of f(r / (size - 1), g / (size - 1), b / (size - 1))) data[i++] = Math.round(v * 65535);
      }
    }
  }
  return btoa(String.fromCharCode(...new Uint8Array(data.buffer)));
}

describe('filter files', () => {
  it('has at least 40 filters in about 10 categories', () => {
    expect(FILTERS.length).toBeGreaterThanOrEqual(40);
    expect(FILTER_CATEGORIES.length).toBeGreaterThanOrEqual(10);
    for (const c of FILTER_CATEGORIES) expect(FILTERS.filter((l) => l.category === c).length).toBeGreaterThanOrEqual(3);
  });

  it('has unique ids and names', () => {
    expect(new Set(FILTERS.map((l) => l.id)).size).toBe(FILTERS.length);
    expect(new Set(FILTERS.map((l) => l.name)).size).toBe(FILTERS.length);
  });

  it('has names of its own', () => {
    for (const f of FILTERS) {
      const words = `${f.id} ${f.name}`.toLowerCase().split(/[\s-]+/);
      for (const taken of THIRD_PARTY) expect(words, f.id).not.toContain(taken);
    }
  });

  it('keeps grain and vignette on the scales of the panel', () => {
    for (const f of FILTERS) {
      expect(f.grain ?? 0, f.id).toBeGreaterThanOrEqual(0);
      expect(f.grain ?? 0, f.id).toBeLessThanOrEqual(100);
      expect(Math.abs(f.vignette ?? 0), f.id).toBeLessThanOrEqual(100);
    }
  });

  it('builds finite, in-range tables of the right size', () => {
    for (const l of FILTERS) {
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
    for (const l of FILTERS) {
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
    for (const l of FILTERS.filter((x) => x.id === 'prata' || x.id === 'carvao')) {
      const data = buildLut(l, 5);
      for (let i = 0; i < data.length; i += 4) {
        expect(data[i]).toBeCloseTo(data[i + 1], 5);
        expect(data[i]).toBeCloseTo(data[i + 2], 5);
      }
    }
  });

  it('finds a filter by id, and nothing for one that does not exist', () => {
    expect(lutById('mel')?.name).toBe('Mel');
    expect(lutById('nada')).toBeUndefined();
  });
});

describe('a measured table', () => {
  it('comes back as it went in, at any size', () => {
    const f = (r: number, g: number, b: number): [number, number, number] => [r * 0.5, g * 0.5 + 0.25, 1 - b];
    const lut = buildLut(plain({ lut: { size: 5, table: tableOf(5, f) } }), 9);
    let i = 0;
    for (let b = 0; b < 9; b++) {
      for (let g = 0; g < 9; g++) {
        for (let r = 0; r < 9; r++) {
          const want = f(r / 8, g / 8, b / 8);
          expect(lut[i]).toBeCloseTo(want[0], 3);
          expect(lut[i + 1]).toBeCloseTo(want[1], 3);
          expect(lut[i + 2]).toBeCloseTo(want[2], 3);
          i += 4;
        }
      }
    }
  });
});

describe('adjustments of a filter', () => {
  const at = (lut: Float32Array, size: number, r: number, g: number, b: number) => {
    const i = ((b * size + g) * size + r) * 4;
    return [lut[i], lut[i + 1], lut[i + 2]];
  };

  it('do nothing when absent or zero', () => {
    expect(buildLut(plain({ adjust: { exposure: 0, contrast: 0 } }), 3)).toEqual(buildLut(plain(), 3));
  });

  it('move colors the way the panel does', () => {
    const size = 5;
    const none = buildLut(plain(), size);
    const mid = (lut: Float32Array) => at(lut, size, 2, 2, 2);
    expect(mid(buildLut(plain({ adjust: { exposure: 30 } }), size))[1]).toBeGreaterThan(mid(none)[1]);
    const warm = mid(buildLut(plain({ adjust: { temperature: 40 } }), size));
    expect(warm[0]).toBeGreaterThan(warm[2]);
    const grey = at(buildLut(plain({ adjust: { saturation: -100 } }), size), size, 4, 1, 0);
    expect(grey[0]).toBeCloseTo(grey[1], 5);
    expect(grey[0]).toBeCloseTo(grey[2], 5);
    const hard = buildLut(plain({ adjust: { contrast: 80 } }), size);
    expect(at(hard, size, 1, 1, 1)[0]).toBeLessThan(0.25);
    expect(at(hard, size, 3, 3, 3)[0]).toBeGreaterThan(0.75);
  });

  it('come before the table', () => {
    const size = 3;
    const lut = buildLut(plain({ adjust: { saturation: -100 }, lut: { ops: [{ op: 'fade', black: 0.5 }] } }), size);
    expect(at(lut, size, 2, 2, 2)[0]).toBeCloseTo(1, 5);
    expect(at(lut, size, 0, 0, 0)[0]).toBeCloseTo(0.5, 5);
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
