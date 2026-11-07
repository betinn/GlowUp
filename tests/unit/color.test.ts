import { describe, expect, it } from 'vitest';
import { hexToRgb, hslToRgb, labToRgb, linearToSrgb, rgbToHex, rgbToHsl, rgbToLab, srgbToLinear, type RGB } from '../../src/core/color';

const SAMPLES: RGB[] = [
  [0, 0, 0],
  [1, 1, 1],
  [0.5, 0.5, 0.5],
  [0.86, 0.66, 0.54],
  [0.1, 0.4, 0.8],
  [0.95, 0.2, 0.1],
  [0.2, 0.7, 0.3],
];

describe('color math', () => {
  it('converts sRGB to linear and back', () => {
    for (const v of [0, 0.01, 0.04045, 0.2, 0.5, 0.9, 1]) expect(linearToSrgb(srgbToLinear(v))).toBeCloseTo(v, 5);
  });

  it('gives the expected Lab reference values', () => {
    const white = rgbToLab([1, 1, 1]);
    expect(white[0]).toBeCloseTo(100, 1);
    expect(Math.abs(white[1])).toBeLessThan(0.05);
    expect(Math.abs(white[2])).toBeLessThan(0.05);
    expect(rgbToLab([0, 0, 0])[0]).toBeCloseTo(0, 3);
    const red = rgbToLab([1, 0, 0]);
    expect(red[0]).toBeCloseTo(53.24, 0);
    expect(red[1]).toBeCloseTo(80.09, 0);
    expect(red[2]).toBeCloseTo(67.2, 0);
  });

  it('round-trips Lab', () => {
    for (const c of SAMPLES) {
      const back = labToRgb(rgbToLab(c));
      back.forEach((v, i) => expect(v).toBeCloseTo(c[i], 3));
    }
  });

  it('round-trips HSL', () => {
    for (const c of SAMPLES) {
      const back = hslToRgb(rgbToHsl(c));
      back.forEach((v, i) => expect(v).toBeCloseTo(c[i], 5));
    }
  });

  it('parses and formats hex', () => {
    expect(rgbToHex(hexToRgb('#b0304a'))).toBe('#b0304a');
  });
});
