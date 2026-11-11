import { describe, expect, it } from 'vitest';
import { hexToHsv, hsvToHex, parseHex } from '../../src/ui/colorpick';

describe('color picker math', () => {
  it('turns the corners of the square into black, white and the pure hue', () => {
    expect(hsvToHex({ h: 0, s: 1, v: 1 })).toBe('#ff0000');
    expect(hsvToHex({ h: 120, s: 1, v: 1 })).toBe('#00ff00');
    expect(hsvToHex({ h: 240, s: 1, v: 1 })).toBe('#0000ff');
    expect(hsvToHex({ h: 200, s: 0, v: 1 })).toBe('#ffffff');
    expect(hsvToHex({ h: 200, s: 1, v: 0 })).toBe('#000000');
  });

  it('gives back the same hex for every preset of the tools', () => {
    for (const hex of ['#5c8fb0', '#4f9c8a', '#6f8f4e', '#8a6a3d', '#7a3d28', '#e0705f', '#d6587a', '#b98a68', '#7a7f8c']) {
      expect(hsvToHex(hexToHsv(hex))).toBe(hex);
    }
  });

  it('keeps the hue of the slider for a grey, which has none', () => {
    expect(hexToHsv('#808080', 210).h).toBe(210);
    expect(hexToHsv('#808080', 210).s).toBe(0);
  });

  it('reads what is typed in the hex field', () => {
    expect(parseHex('#ABC')).toBe('#aabbcc');
    expect(parseHex(' 5c8fb0 ')).toBe('#5c8fb0');
    expect(parseHex('#5c8fb')).toBeNull();
    expect(parseHex('azul')).toBeNull();
  });
});
