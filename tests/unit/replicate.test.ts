import { describe, expect, it } from 'vitest';
import { buildLut, lutById, type FilterData } from '../../src/presets/luts';
// @ts-expect-error plain script, without types
import { alignImages } from '../../scripts/replicate/align.mjs';
// @ts-expect-error plain script, without types
import { fitLut, identityLut, lookup } from '../../scripts/replicate/lut.mjs';
// @ts-expect-error plain script, without types
import { deltaE2000 } from '../../scripts/replicate/measure.mjs';
// @ts-expect-error plain script, without types
import { grainNoise, GRAIN_GAIN, grainWeight, vignetteOff, vignetteOn, vignetteShape } from '../../scripts/replicate/finish.mjs';
// @ts-expect-error plain script, without types
import { replicate, reportMarkdown } from '../../scripts/replicate/replicate.mjs';

interface Img {
  w: number;
  h: number;
  rgb: Float32Array;
}

/** No real photo here: patches of many colors with soft light and fine texture, deterministic. */
function scene(w: number, h: number, seed = 0): Img {
  const rgb = new Float32Array(w * h * 3);
  const hash = (x: number, y: number) => {
    const v = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const patch = Math.max(16, Math.round(w / 9));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = Math.floor(x / patch);
      const py = Math.floor(y / patch);
      const u = (x % patch) / patch;
      const v = (y % patch) / patch;
      const light = 0.55 + 0.35 * Math.sin((u + v) * 1.5 + px);
      const texture = (hash(x, y) - 0.5) * 0.03;
      const i = (y * w + x) * 3;
      rgb[i] = Math.min(1, Math.max(0, hash(px, py) * light + texture));
      rgb[i + 1] = Math.min(1, Math.max(0, hash(px + 40, py) * light + texture));
      rgb[i + 2] = Math.min(1, Math.max(0, hash(px, py + 40) * light + texture));
    }
  }
  return { w, h, rgb };
}

const tableOf = (filter: FilterData) => {
  const size = 33;
  const rgba = buildLut(filter, size);
  const nodes = new Float32Array(size ** 3 * 3);
  for (let i = 0; i < size ** 3; i++) for (let k = 0; k < 3; k++) nodes[i * 3 + k] = rgba[i * 4 + k];
  return { size, nodes };
};

function filtered(img: Img, filter: FilterData): Img {
  const lut = tableOf(filter);
  const rgb = new Float32Array(img.rgb.length);
  const c = [0, 0, 0];
  const vignette = (filter.vignette ?? 0) / 100;
  const grain = (filter.grain ?? 0) / 100;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      const i = y * img.w + x;
      lookup(lut, img.rgb[i * 3], img.rgb[i * 3 + 1], img.rgb[i * 3 + 2], c);
      if (vignette) {
        const s = vignetteShape((x + 0.5) / img.w, (y + 0.5) / img.h);
        for (let k = 0; k < 3; k++) c[k] = vignetteOn(c[k], vignette, s);
      }
      if (grain) {
        const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
        const n = grainNoise((x + 0.5) / img.w, (y + 0.5) / img.h) * grain * GRAIN_GAIN * grainWeight(l);
        for (let k = 0; k < 3; k++) c[k] += n;
      }
      rgb.set(c, i * 3);
    }
  }
  return { w: img.w, h: img.h, rgb };
}

/** Another picture of the same scene: resampled, shifted and a little tilted. */
function moved(img: Img, scale: number, dx: number, dy: number, tilt = 0): { img: Img; toSource: number[] } {
  const w = Math.round(img.w * scale * 0.9);
  const h = Math.round(img.h * scale * 0.9);
  const rgb = new Float32Array(w * h * 3);
  const a = (tilt * Math.PI) / 180;
  const k = 1 / scale;
  const map = [Math.cos(a) * k, -Math.sin(a) * k, dx, Math.sin(a) * k, Math.cos(a) * k, dy];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = map[0] * x + map[1] * y + map[2];
      const sy = map[3] * x + map[4] * y + map[5];
      const ix = Math.min(img.w - 2, Math.max(0, Math.floor(sx)));
      const iy = Math.min(img.h - 2, Math.max(0, Math.floor(sy)));
      const fx = sx - ix;
      const fy = sy - iy;
      const p = (iy * img.w + ix) * 3;
      const q = p + img.w * 3;
      for (let c = 0; c < 3; c++) {
        rgb[(y * w + x) * 3 + c] =
          (img.rgb[p + c] * (1 - fx) + img.rgb[p + 3 + c] * fx) * (1 - fy) + (img.rgb[q + c] * (1 - fx) + img.rgb[q + 3 + c] * fx) * fy;
      }
    }
  }
  return { img: { w, h, rgb }, toSource: map };
}

const META = { id: 'x', name: 'X', category: 'Y' };

describe('color distance', () => {
  // Reference values from the published CIEDE2000 test data.
  it('matches the published values', () => {
    expect(deltaE2000(50, 2.6772, -79.7751, 50, 0, -82.7485)).toBeCloseTo(2.0425, 3);
    expect(deltaE2000(50, 2.5, 0, 50, 0, -2.5)).toBeCloseTo(4.3065, 3);
    expect(deltaE2000(60.2574, -34.0099, 36.2677, 60.4626, -34.1751, 39.4387)).toBeCloseTo(1.2644, 3);
  });

  it('is zero between equal colors', () => {
    expect(deltaE2000(50, 10, 10, 50, 10, 10)).toBe(0);
  });
});

describe('vignette and grain formulas', () => {
  it('take the vignette back out', () => {
    for (const amount of [0.4, -0.4]) {
      const s = vignetteShape(0.05, 0.05);
      expect(s).toBeGreaterThan(0.3);
      expect(vignetteOff(vignetteOn(0.6, amount, s), amount, s)).toBeCloseTo(0.6, 5);
    }
  });

  it('leave the middle of the photo alone', () => {
    expect(vignetteShape(0.5, 0.5)).toBe(0);
  });
});

describe('table fit', () => {
  const pairsOf = (f: (c: number[]) => number[], n = 20000) => {
    const input = new Float32Array(n * 3);
    const output = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const c = [Math.abs(Math.sin(i * 12.9898)), Math.abs(Math.sin(i * 78.233)), Math.abs(Math.sin(i * 37.719))];
      input.set(c, i * 3);
      output.set(f(c), i * 3);
    }
    return { input, output };
  };

  it('stays the identity when nothing changed', () => {
    const { input, output } = pairsOf((c) => c);
    const { nodes } = fitLut(input, output, { size: 9 });
    const worst = identityLut(9).nodes.reduce((m: number, v: number, i: number) => Math.max(m, Math.abs(v - nodes[i])), 0);
    expect(worst).toBeLessThan(0.002);
  });

  it('recovers a strong color move', () => {
    const f = (c: number[]) => [c[0] ** 0.8, c[1] * 0.85 + 0.05, 1 - (1 - c[2]) ** 1.2];
    const { input, output } = pairsOf(f);
    const lut = fitLut(input, output, { size: 17 });
    const out = [0, 0, 0];
    let worst = 0;
    for (const c of [[0.2, 0.5, 0.7], [0.8, 0.3, 0.1], [0.5, 0.5, 0.5], [0.05, 0.9, 0.3]]) {
      lookup(lut, c[0], c[1], c[2], out);
      const want = f(c);
      for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(out[k] - want[k]));
    }
    expect(worst).toBeLessThan(0.012);
  });

  it('keeps going smoothly where there were no samples', () => {
    const f = (c: number[]) => [c[0] * 0.9 + 0.05, c[1] * 0.9 + 0.05, c[2] * 0.9 + 0.05];
    // Samples only in the lower half of the cube.
    const { input, output } = pairsOf((c) => f(c.map((v) => v / 2)));
    const half = input.map((v: number) => v / 2);
    const lut = fitLut(half, output, { size: 9 });
    const out = lookup(lut, 0.9, 0.9, 0.9, [0, 0, 0]);
    for (const v of out) expect(v).toBeCloseTo(0.86, 1);
  });
});

describe('alignment', () => {
  const near = (map: number[], want: number[]) => {
    const corners = [[0, 0], [300, 0], [0, 300], [300, 300]];
    let worst = 0;
    for (const [x, y] of corners) {
      worst = Math.max(worst, Math.abs(map[0] * x + map[1] * y + map[2] - (want[0] * x + want[1] * y + want[2])));
      worst = Math.max(worst, Math.abs(map[3] * x + map[4] * y + map[5] - (want[3] * x + want[4] * y + want[5])));
    }
    return worst;
  };

  it('sees that two photos with the same frame are on top of each other, whatever the filter', () => {
    const img = scene(420, 520);
    const { map, score } = alignImages(img, filtered(img, lutById('cinema-tarde')!));
    expect(near(map, [1, 0, 0, 0, 1, 0])).toBeLessThan(0.5);
    expect(score).toBeGreaterThan(0.95);
  });

  it('finds a crop, a resize and a small tilt', () => {
    const img = scene(600, 720);
    const { img: after, toSource } = moved(filtered(img, lutById('mel')!), 0.75, 22, 14, 0.5);
    const { map, score } = alignImages(img, after);
    expect(near(map, toSource)).toBeLessThan(1);
    expect(score).toBeGreaterThan(0.9);
  });
});

describe('replication', () => {
  const before = scene(600, 720, 1);
  const holdBefore = scene(600, 720, 2);

  it('recovers a known table', () => {
    const filter = lutById('mel')!;
    const { report, filter: out } = replicate(
      [{ name: 'a', before, after: filtered(before, filter) }],
      [{ name: 'b', before: holdBefore, after: filtered(holdBefore, filter) }],
      META,
    );
    expect(report.pairs[0].error.mean).toBeLessThan(0.6);
    expect(report.holdouts[0].error.mean).toBeLessThan(1);
    expect(report.grain).toBe(0);
    expect(report.vignette).toBe(0);
    expect(report.localEffect).toBe(false);
    // The file it writes is a filter like any other, and the app reads the same colors from it.
    const rebuilt = buildLut(out as FilterData, 17);
    expect(rebuilt).toHaveLength(17 ** 3 * 4);
    expect('table' in out.lut).toBe(true);
    expect(out.suggest).toBe(false);
  });

  it('recovers grain and vignette', () => {
    const base = lutById('prata')!;
    const filter = { ...base, grain: 30, vignette: 25 };
    const { report } = replicate([{ name: 'a', before, after: filtered(before, filter) }], [], META);
    expect(Math.abs(report.grain - 30)).toBeLessThan(5);
    expect(Math.abs(report.vignette - 25)).toBeLessThan(5);
    expect(report.pairs[0].error.mean).toBeLessThan(1);
  });

  it('points out light on one area of the photo', () => {
    const after = filtered(before, lutById('mel')!);
    for (let y = 200; y < 500; y++) {
      for (let x = 180; x < 420; x++) {
        const i = (y * before.w + x) * 3;
        for (let k = 0; k < 3; k++) after.rgb[i + k] = Math.min(1, after.rgb[i + k] + 0.12);
      }
    }
    const { report } = replicate([{ name: 'a', before, after }], [], META);
    expect(report.localEffect).toBe(true);
    expect(report.pairs[0].localColor.found).toBe(true);
    const box = report.pairs[0].localColor.box;
    expect(box.left).toBeGreaterThan(0.2);
    expect(box.right).toBeLessThan(0.8);
  });

  it('points out detail taken from one area of the photo', () => {
    const after = filtered(before, lutById('neblina')!);
    const copy = after.rgb.slice();
    const radius = 3;
    for (let y = 200; y < 500; y++) {
      for (let x = 180; x < 420; x++) {
        for (let k = 0; k < 3; k++) {
          let sum = 0;
          for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) sum += copy[((y + dy) * before.w + x + dx) * 3 + k];
          }
          after.rgb[(y * before.w + x) * 3 + k] = sum / (2 * radius + 1) ** 2;
        }
      }
    }
    const { report } = replicate([{ name: 'a', before, after }], [], META);
    expect(report.pairs[0].localDetail.found).toBe(true);
  });

  it('writes a report with the color error and the local effects', () => {
    const filter = lutById('mel')!;
    const { report } = replicate([{ name: 'a', before, after: filtered(before, filter) }], [], META);
    const text = reportMarkdown(report);
    expect(text).toContain('delta E');
    expect(text).toContain('Nenhum efeito local');
    expect(text).toContain('Sem par separado');
  });
});
