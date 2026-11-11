import { clamp, hexToRgb, rgbToHex } from '../core/color';
import { prefs } from './state.svelte';

/** Hue in 0..360, saturation and value in 0..1. */
export interface HSV {
  h: number;
  s: number;
  v: number;
}

export function hsvToHex({ h, s, v }: HSV): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * clamp(Math.min(k, 4 - k), 0, 1);
  };
  return rgbToHex([f(5), f(3), f(1)]);
}

/** `hue` stands for a grey, which has none of its own: the square keeps where the hue slider was. */
export function hexToHsv(hex: string, hue = 0): HSV {
  const [r, g, b] = hexToRgb(hex);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = hue;
  if (d > 1e-6) {
    if (max === r) h = 60 * (((g - b) / d + 6) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return { h, s: max > 0 ? d / max : 0, v: max };
}

/** `#abc` or `abc123` as typed in the field, as the `#rrggbb` the tools read, or null. */
export function parseHex(text: string): string | null {
  const t = text.trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(t)) return `#${[...t].map((c) => c + c).join('')}`;
  if (/^[0-9a-f]{6}$/.test(t)) return `#${t}`;
  return null;
}

/** How many custom colors each tool keeps. */
export const RECENT_MAX = 5;

const key = (id: string) => `glowup.colors.${id}`;

export function readRecent(id: string): string[] {
  const kept = prefs.read<unknown>(key(id), []);
  return Array.isArray(kept) ? kept.filter((c): c is string => typeof c === 'string' && parseHex(c) === c).slice(0, RECENT_MAX) : [];
}

/** Puts `color` first among the custom colors of a tool, unless the palette already has it. */
export function keepRecent(id: string, color: string, palette: string[]): string[] {
  const list = readRecent(id);
  if (palette.includes(color)) return list;
  const next = [color, ...list.filter((c) => c !== color)].slice(0, RECENT_MAX);
  prefs.write(key(id), next);
  return next;
}
