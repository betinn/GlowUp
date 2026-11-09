/**
 * The filters. Each one is a file of data in `presets/filters/`, and adding a file is all it takes: the
 * render code knows only the 3D table this module builds, plus a grain and a vignette amount. Nothing
 * here moves a pixel, so a filter never changes the shape of a face.
 */

import { clamp, hslToRgb, luma, mix, rgbToHsl, smoothstep, srgbToLinear, linearToSrgb, type RGB } from '../core/color';

type ColorOp = (c: RGB) => RGB;
type Curve = [number, number][];

/** One step of a table described by its recipe, run in order over every color. */
export type OpData =
  | { op: 'curve'; points: Curve }
  | { op: 'rgbCurves'; r: Curve; g: Curve; b: Curve }
  /** Lifted blacks and lowered whites. */
  | { op: 'fade'; black: number; white?: number }
  | { op: 'saturate'; k: number }
  /** White balance gains in linear light. */
  | { op: 'warm'; t: number; tint?: number }
  /** Tints shadows and highlights with different colors. */
  | { op: 'split'; shadow: string; highlight: string; amount: number; balance?: number }
  /** Shifts the hue of one color band. Keeps skin safe by choosing narrow bands. */
  | { op: 'hueBand'; center: number; width: number; shift: number; sat?: number }
  /** Black and white from a channel mix. */
  | { op: 'mono'; r: number; g: number; b: number };

/** A measured table: base64 of 16-bit little-endian RGB over a grid of `size` cubed, R varying fastest. */
export interface TableData {
  size: number;
  table: string;
}

/**
 * Color moves of the filter, on the same scales as the Ajustes panel. They are baked into the table, so
 * they follow the intensity and the area of the filter without any code in the shaders. That is why
 * there is no sharpening here: it needs the neighbors of a pixel, and a table sees one color at a time.
 */
export interface FilterAdjust {
  exposure?: number;
  contrast?: number;
  highlights?: number;
  shadows?: number;
  temperature?: number;
  tint?: number;
  saturation?: number;
  vibrance?: number;
}

/** What a file in `presets/filters/` holds. */
export interface FilterData {
  id: string;
  name: string;
  category: string;
  /** False keeps it out of the automatic suggestion, for strong looks that are a choice of the person. */
  suggest?: boolean;
  lut: { ops: OpData[] } | TableData;
  adjust?: FilterAdjust;
  /** 0..100, same scale as Granulação. */
  grain?: number;
  /** -100..100, same scale as Vinheta. */
  vignette?: number;
}

/** Monotone cubic interpolation through (x, y) points. */
export function curveFn(points: Curve): (x: number) => number {
  const n = points.length;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const d: number[] = [];
  const m = new Array<number>(n).fill(0);
  for (let i = 0; i < n - 1; i++) d[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * ys[i] +
      (t3 - 2 * t2 + t) * h * m[i] +
      (-2 * t3 + 3 * t2) * ys[i + 1] +
      (t3 - t2) * h * m[i + 1]
    );
  };
}

const hexColor = (hex: string): RGB => {
  const v = parseInt(hex.slice(1), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
};

const saturated = (c: RGB, k: number): RGB => {
  const l = luma(c);
  return [mix(l, c[0], k), mix(l, c[1], k), mix(l, c[2], k)];
};

function opFn(d: OpData): ColorOp {
  switch (d.op) {
    case 'curve': {
      const f = curveFn(d.points);
      return ([r, g, b]) => [f(r), f(g), f(b)];
    }
    case 'rgbCurves': {
      const fr = curveFn(d.r);
      const fg = curveFn(d.g);
      const fb = curveFn(d.b);
      return ([r, g, b]) => [fr(r), fg(g), fb(b)];
    }
    case 'fade': {
      const white = d.white ?? 1;
      return ([r, g, b]) => [mix(d.black, white, r), mix(d.black, white, g), mix(d.black, white, b)];
    }
    case 'saturate':
      return (c) => saturated(c, d.k);
    case 'warm': {
      const gr = 1 + 0.2 * d.t;
      const gb = 1 - 0.2 * d.t;
      const gg = 1 - 0.1 * (d.tint ?? 0);
      return ([r, g, b]) => [
        linearToSrgb(clamp(srgbToLinear(r) * gr)),
        linearToSrgb(clamp(srgbToLinear(g) * gg)),
        linearToSrgb(clamp(srgbToLinear(b) * gb)),
      ];
    }
    case 'split': {
      const shadow = hexColor(d.shadow);
      const highlight = hexColor(d.highlight);
      const balance = d.balance ?? 0.5;
      return (c) => {
        const l = luma(c);
        const hw = smoothstep(balance - 0.15, 1, l) * d.amount;
        const sw = (1 - smoothstep(0, balance + 0.15, l)) * d.amount;
        return [
          c[0] + (shadow[0] - 0.5) * sw + (highlight[0] - 0.5) * hw,
          c[1] + (shadow[1] - 0.5) * sw + (highlight[1] - 0.5) * hw,
          c[2] + (shadow[2] - 0.5) * sw + (highlight[2] - 0.5) * hw,
        ];
      };
    }
    case 'hueBand':
      return (c) => {
        const [h, s, l] = rgbToHsl([clamp(c[0]), clamp(c[1]), clamp(c[2])]);
        const dist = Math.min(Math.abs(h - d.center), 1 - Math.abs(h - d.center));
        const w = 1 - smoothstep(d.width * 0.5, d.width, dist);
        if (w <= 0) return c;
        return hslToRgb([(h + d.shift * w + 1) % 1, clamp(s * mix(1, d.sat ?? 1, w)), l]);
      };
    case 'mono':
      return ([r, g, b]) => {
        const v = r * d.r + g * d.g + b * d.b;
        return [v, v, v];
      };
  }
}

/** The moves of Ajustes, color by color, in the order of `develop.frag`. Shadows and highlights read the pixel itself. */
function adjustFn(a: FilterAdjust): ColorOp {
  const exposure = (a.exposure ?? 0) / 100;
  const temp = (a.temperature ?? 0) / 100;
  const tint = (a.tint ?? 0) / 100;
  const highlights = (a.highlights ?? 0) / 100;
  const shadows = (a.shadows ?? 0) / 100;
  const contrast = (a.contrast ?? 0) / 100;
  const saturation = (a.saturation ?? 0) / 100;
  const vibrance = (a.vibrance ?? 0) / 100;
  const gains: RGB = [1 + 0.22 * temp + 0.06 * tint, 1 - 0.12 * tint, 1 - 0.22 * temp + 0.06 * tint];
  const gain = 2 ** (exposure * 2);
  const sCurve = (x: number) => {
    if (contrast < 0) return 0.5 + (x - 0.5) * (1 + 0.6 * contrast);
    return mix(x, x * x * (3 - 2 * x), contrast);
  };
  return (input) => {
    let c = input;
    if (exposure || temp || tint) c = [0, 1, 2].map((i) => linearToSrgb(srgbToLinear(clamp(c[i])) * gain * gains[i])) as RGB;
    if (highlights || shadows) {
      const l = Math.max(luma(c), 1e-3);
      const target = l + shadows * 0.32 * (1 - smoothstep(0.08, 0.6, l)) * (1 - l) + highlights * 0.34 * smoothstep(0.4, 0.95, l) * l;
      const k = Math.max(target, 0) / l;
      c = [c[0] * k, c[1] * k, c[2] * k];
    }
    if (contrast) c = [sCurve(clamp(c[0])), sCurve(clamp(c[1])), sCurve(clamp(c[2]))];
    if (saturation || vibrance) {
      const sat = Math.max(...c) - Math.min(...c);
      const [h] = rgbToHsl([clamp(c[0]), clamp(c[1]), clamp(c[2])]);
      const skin = 1 - smoothstep(0.03, 0.09, Math.abs(h - 0.07));
      c = saturated(c, 1 + saturation + vibrance * (1 - sat) * (1 - 0.7 * skin));
    }
    return c;
  };
}

/** Reads a measured table back, for lookups between its nodes. */
function tableFn({ size, table }: TableData): ColorOp {
  const bytes = Uint8Array.from(atob(table), (ch) => ch.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  const at = (i: number) => view.getUint16(i * 2, true) / 65535;
  const last = size - 1;
  return ([r, g, b]) => {
    const p = [clamp(r) * last, clamp(g) * last, clamp(b) * last];
    const i = p.map((v) => Math.min(Math.floor(v), last - 1));
    const f = p.map((v, k) => v - i[k]);
    const out: RGB = [0, 0, 0];
    for (let corner = 0; corner < 8; corner++) {
      const dx = corner & 1;
      const dy = (corner >> 1) & 1;
      const dz = (corner >> 2) & 1;
      const w = (dx ? f[0] : 1 - f[0]) * (dy ? f[1] : 1 - f[1]) * (dz ? f[2] : 1 - f[2]);
      if (w === 0) continue;
      const node = ((i[2] + dz) * size + i[1] + dy) * size + i[0] + dx;
      for (let k = 0; k < 3; k++) out[k] += w * at(node * 3 + k);
    }
    return out;
  };
}

/** Everything a filter does to one color. The result can leave the 0..1 range until the table clamps it. */
function colorFn(filter: FilterData): ColorOp {
  const steps: ColorOp[] = 'table' in filter.lut ? [tableFn(filter.lut)] : filter.lut.ops.map(opFn);
  if (filter.adjust) steps.unshift(adjustFn(filter.adjust));
  return (c) => steps.reduce((value, step) => step(value), c);
}

/** Evaluates a filter over an N-cubed grid. R varies fastest. Output is RGBA float. */
export function buildLut(filter: FilterData, size = 33): Float32Array {
  const color = colorFn(filter);
  const data = new Float32Array(size * size * size * 4);
  const k = 1 / (size - 1);
  let i = 0;
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const c = color([r * k, g * k, b * k]);
        data[i++] = clamp(c[0]);
        data[i++] = clamp(c[1]);
        data[i++] = clamp(c[2]);
        data[i++] = 1;
      }
    }
  }
  return data;
}

const FILES = import.meta.glob<FilterData>('./filters/*.json', { eager: true, import: 'default' });

/** Order of the known categories in the menu. A filter with a new category needs no change: it comes after them. */
const CATEGORY_ORDER = ['Natural', 'Sol', 'Mar', 'Película', 'Mono', 'Pastel', 'Noite', 'Retrô', 'Editorial', 'Sonho'];

const categoryRank = (category: string) => {
  const i = CATEGORY_ORDER.indexOf(category);
  return i < 0 ? CATEGORY_ORDER.length : i;
};

export const FILTERS: FilterData[] = Object.values(FILES).sort(
  (a, b) => categoryRank(a.category) - categoryRank(b.category) || a.category.localeCompare(b.category, 'pt') || a.name.localeCompare(b.name, 'pt'),
);

export const FILTER_CATEGORIES: string[] = [...new Set(FILTERS.map((f) => f.category))];

export const lutById = (id: string) => FILTERS.find((f) => f.id === id);
