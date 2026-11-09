import { describe, expect, it } from 'vitest';
import { FILTERS, type FilterData } from '../../src/presets/luts';
import { easedFault, readTone, suggestFilter, type Tone } from '../../src/presets/suggest';

/** A little photo: a skin color with some spread of light, shifted by what the test asks. */
function photo({ light = 1, warm = 0 } = {}): Uint8Array {
  const n = 64;
  const out = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const k = (0.45 + 0.55 * ((x + y) / (2 * n - 2))) * light;
      const i = (y * n + x) * 4;
      out[i] = Math.min(255, 215 * k * (1 + warm));
      out[i + 1] = Math.min(255, 170 * k);
      out[i + 2] = Math.min(255, 145 * k * (1 - warm));
      out[i + 3] = 255;
    }
  }
  return out;
}

const rgbOf = (rgba: Uint8Array) => {
  const rgb = new Float32Array((rgba.length / 4) * 3);
  for (let i = 0; i < rgba.length / 4; i++) {
    for (let k = 0; k < 3; k++) rgb[i * 3 + k] = rgba[i * 4 + k] / 255;
  }
  return rgb;
};

describe('tone of a photo', () => {
  it('reads light, spread and warmth', () => {
    const base = readTone(rgbOf(photo()));
    expect(readTone(rgbOf(photo({ light: 0.5 }))).light).toBeLessThan(base.light - 10);
    expect(readTone(rgbOf(photo({ warm: -0.2 }))).b).toBeLessThan(base.b - 5);
    expect(base.range).toBeGreaterThan(15);
  });
});

describe('suggestion', () => {
  it('always gives a filter that exists, and the same one twice', () => {
    const a = suggestFilter(photo(), FILTERS)!;
    expect(FILTERS.some((f) => f.id === a.id)).toBe(true);
    expect(suggestFilter(photo(), FILTERS)!.id).toBe(a.id);
  });

  it('leaves out the strong looks', () => {
    for (const p of [photo(), photo({ light: 0.4 }), photo({ warm: -0.3 })]) {
      const { ranking } = suggestFilter(p, FILTERS)!;
      const left = new Set(FILTERS.filter((f) => f.suggest === false).map((f) => f.id));
      expect(left.size).toBeGreaterThan(0);
      for (const r of ranking) expect(left.has(r.id)).toBe(false);
    }
  });

  it('changes with the tone of the photo', () => {
    const picks = new Set([photo({ light: 0.45 }), photo({ light: 1.25 }), photo({ warm: -0.25 }), photo({ warm: 0.25 })].map((p) => suggestFilter(p, FILTERS)!.id));
    expect(picks.size).toBeGreaterThan(1);
  });

  it('never picks a cold filter for a cold photo', () => {
    const cold = photo({ warm: -0.25 });
    const pick = suggestFilter(cold, FILTERS)!;
    const filter = FILTERS.find((f) => f.id === pick.id)!;
    expect(filter.category).not.toBe('Mar');
  });

  it('takes part any new filter, with no code', () => {
    const fresh: FilterData = { id: 'novo', name: 'Novo', category: 'Outra', lut: { ops: [{ op: 'warm', t: 0.5 }, { op: 'curve', points: [[0, 0.05], [0.5, 0.62], [1, 1]] }] } };
    const dark = photo({ light: 0.45, warm: -0.3 });
    expect(suggestFilter(dark, [fresh])!.id).toBe('novo');
    expect(suggestFilter(dark, [fresh, ...FILTERS])!.ranking.some((r) => r.id === 'novo')).toBe(true);
  });

  it('has nothing to say when every filter stays out', () => {
    expect(suggestFilter(photo(), [{ id: 'a', name: 'A', category: 'B', suggest: false, lut: { ops: [] } }])).toBeNull();
  });
});

describe('words of the suggestion', () => {
  const tone = (over: Partial<Tone> = {}): Tone => ({ light: 58, range: 70, a: 9, b: 13, chroma: 22, clipped: 0, ...over });

  it('credit only what was off and got better', () => {
    expect(easedFault(tone({ light: 35 }), tone({ light: 50 }))).toBe('dark');
    expect(easedFault(tone({ b: 2 }), tone({ b: 10 }))).toBe('cold');
    expect(easedFault(tone({ range: 40 }), tone({ range: 62 }))).toBe('flat');
    expect(easedFault(tone({ chroma: 10 }), tone({ chroma: 20 }))).toBe('dull');
  });

  it('stay quiet when the filter did not ease it', () => {
    expect(easedFault(tone(), tone({ b: 10 }))).toBeNull();
    expect(easedFault(tone({ b: 2 }), tone({ b: 1 }))).toBeNull();
    expect(easedFault(tone({ b: 2 }), tone({ b: 26 }))).toBeNull();
  });
});
