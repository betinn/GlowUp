/**
 * Original 3D LUTs, generated on the device. Nothing is downloaded: each filter is a short recipe
 * of color operations, evaluated over a 3D grid when first used.
 */

import { clamp, hslToRgb, luma, mix, rgbToHsl, smoothstep, srgbToLinear, linearToSrgb, type RGB } from '../core/color';

type ColorOp = (c: RGB) => RGB;

export interface LutRecipe {
  id: string;
  name: string;
  category: string;
  ops: ColorOp[];
}

/** Piecewise smooth curve through (x, y) points, using monotone cubic interpolation. */
export function curveFn(points: [number, number][]): (x: number) => number {
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

/** Same tone curve on all channels. */
const curve = (...pts: [number, number][]): ColorOp => {
  const f = curveFn(pts);
  return ([r, g, b]) => [f(r), f(g), f(b)];
};

/** Separate curve per channel. */
const rgbCurves = (r: [number, number][], g: [number, number][], b: [number, number][]): ColorOp => {
  const fr = curveFn(r);
  const fg = curveFn(g);
  const fb = curveFn(b);
  return ([x, y, z]) => [fr(x), fg(y), fb(z)];
};

/** Lifted blacks and lowered whites. */
const fade = (black: number, white = 1): ColorOp => {
  return ([r, g, b]) => [mix(black, white, r), mix(black, white, g), mix(black, white, b)];
};

const saturate = (k: number): ColorOp => {
  return (c) => {
    const l = luma(c);
    return [mix(l, c[0], k), mix(l, c[1], k), mix(l, c[2], k)];
  };
};

/** White balance gains in linear light. */
const warm = (t: number, tint = 0): ColorOp => {
  const gr = 1 + 0.2 * t;
  const gb = 1 - 0.2 * t;
  const gg = 1 - 0.1 * tint;
  return ([r, g, b]) => [
    linearToSrgb(clamp(srgbToLinear(r) * gr)),
    linearToSrgb(clamp(srgbToLinear(g) * gg)),
    linearToSrgb(clamp(srgbToLinear(b) * gb)),
  ];
};

/** Tints shadows and highlights with different colors. */
const split = (shadow: RGB, highlight: RGB, amount: number, balance = 0.5): ColorOp => {
  return (c) => {
    const l = luma(c);
    const hw = smoothstep(balance - 0.15, 1, l) * amount;
    const sw = (1 - smoothstep(0, balance + 0.15, l)) * amount;
    return [
      c[0] + (shadow[0] - 0.5) * sw + (highlight[0] - 0.5) * hw,
      c[1] + (shadow[1] - 0.5) * sw + (highlight[1] - 0.5) * hw,
      c[2] + (shadow[2] - 0.5) * sw + (highlight[2] - 0.5) * hw,
    ];
  };
};

/** Shifts the hue of one color band. Keeps skin safe by choosing narrow bands. */
const hueBand = (center: number, width: number, shift: number, satGain = 1): ColorOp => {
  return (c) => {
    const [h, s, l] = rgbToHsl([clamp(c[0]), clamp(c[1]), clamp(c[2])]);
    const d = Math.min(Math.abs(h - center), 1 - Math.abs(h - center));
    const w = 1 - smoothstep(width * 0.5, width, d);
    if (w <= 0) return c;
    return hslToRgb([(h + shift * w + 1) % 1, clamp(s * mix(1, satGain, w)), l]);
  };
};

/** Black and white from a channel mix. */
const mono = (wr: number, wg: number, wb: number): ColorOp => {
  return ([r, g, b]) => {
    const v = r * wr + g * wg + b * wb;
    return [v, v, v];
  };
};

const SOFT_S: [number, number][] = [
  [0, 0],
  [0.25, 0.22],
  [0.75, 0.79],
  [1, 1],
];
const STRONG_S: [number, number][] = [
  [0, 0],
  [0.22, 0.14],
  [0.5, 0.52],
  [0.78, 0.87],
  [1, 1],
];
const MATTE: [number, number][] = [
  [0, 0.07],
  [0.25, 0.25],
  [0.75, 0.76],
  [1, 0.96],
];

const hex = (v: number): RGB => [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];

export const LUT_CATEGORIES = [
  'Natural',
  'Sol',
  'Mar',
  'Película',
  'Mono',
  'Pastel',
  'Noite',
  'Retrô',
  'Editorial',
  'Sonho',
] as const;

export const LUTS: LutRecipe[] = [
  // Natural
  { id: 'pele-limpa', name: 'Pele Limpa', category: 'Natural', ops: [curve(...SOFT_S), saturate(1.04), warm(0.04)] },
  { id: 'manha', name: 'Manhã', category: 'Natural', ops: [warm(0.08), curve([0, 0.02], [0.5, 0.53], [1, 1]), saturate(1.02)] },
  { id: 'janela', name: 'Janela', category: 'Natural', ops: [curve([0, 0.03], [0.3, 0.31], [0.7, 0.74], [1, 1]), warm(-0.03), saturate(0.97)] },
  { id: 'vivo', name: 'Vivo', category: 'Natural', ops: [curve(...SOFT_S), saturate(1.14), hueBand(0.33, 0.1, 0.01, 1.1)] },

  // Sol
  { id: 'mel', name: 'Mel', category: 'Sol', ops: [warm(0.22), split(hex(0x8a5a30), hex(0xffd9a0), 0.12), curve(...SOFT_S)] },
  { id: 'hora-dourada', name: 'Hora Dourada', category: 'Sol', ops: [warm(0.32, -0.1), curve([0, 0.03], [0.5, 0.56], [1, 1]), saturate(1.08)] },
  { id: 'damasco', name: 'Damasco', category: 'Sol', ops: [split(hex(0x7a4a50), hex(0xffc8a0), 0.16), curve(...SOFT_S), saturate(1.02)] },
  { id: 'areia', name: 'Areia', category: 'Sol', ops: [warm(0.16), fade(0.04, 0.98), saturate(0.86), curve(...SOFT_S)] },

  // Mar
  { id: 'mare', name: 'Maré', category: 'Mar', ops: [warm(-0.16), split(hex(0x305a70), hex(0xe8f4ff), 0.14), curve(...SOFT_S)] },
  { id: 'neblina', name: 'Neblina', category: 'Mar', ops: [warm(-0.1), fade(0.07, 0.96), saturate(0.8)] },
  { id: 'menta', name: 'Menta', category: 'Mar', ops: [split(hex(0x3a7a68), hex(0xf0ffe8), 0.14), hueBand(0.55, 0.14, -0.04, 1.05), curve(...SOFT_S)] },
  { id: 'gelo', name: 'Gelo', category: 'Mar', ops: [warm(-0.24, 0.05), curve([0, 0], [0.5, 0.54], [1, 1]), saturate(0.9)] },

  // Película
  {
    id: 'grao-quente',
    name: 'Grão Quente',
    category: 'Película',
    ops: [
      rgbCurves(
        [[0, 0.05], [0.5, 0.54], [1, 0.99]],
        [[0, 0.03], [0.5, 0.5], [1, 0.97]],
        [[0, 0.07], [0.5, 0.45], [1, 0.9]],
      ),
      saturate(0.94),
    ],
  },
  {
    id: 'caixa-de-sapato',
    name: 'Caixa de Sapato',
    category: 'Película',
    ops: [curve(...MATTE), split(hex(0x5a4a70), hex(0xffe0b0), 0.13), saturate(0.88)],
  },
  { id: 'cinema-tarde', name: 'Cinema à Tarde', category: 'Película', ops: [split(hex(0x205a68), hex(0xffc890), 0.2), curve(...STRONG_S), saturate(0.92)] },
  {
    id: 'verde-antigo',
    name: 'Verde Antigo',
    category: 'Película',
    ops: [
      rgbCurves(
        [[0, 0.02], [0.5, 0.48], [1, 0.97]],
        [[0, 0.05], [0.5, 0.52], [1, 1]],
        [[0, 0.06], [0.5, 0.46], [1, 0.92]],
      ),
      saturate(0.9),
    ],
  },

  // Mono
  { id: 'prata', name: 'Prata', category: 'Mono', ops: [mono(0.3, 0.59, 0.11), curve(...SOFT_S)] },
  { id: 'carvao', name: 'Carvão', category: 'Mono', ops: [mono(0.42, 0.5, 0.08), curve(...STRONG_S)] },
  { id: 'selenio', name: 'Selênio', category: 'Mono', ops: [mono(0.34, 0.56, 0.1), curve(...SOFT_S), split(hex(0x60506a), hex(0xfdf5ee), 0.12)] },
  { id: 'sepia-leve', name: 'Sépia Leve', category: 'Mono', ops: [mono(0.34, 0.56, 0.1), curve(...MATTE), split(hex(0x7a5a3a), hex(0xfff0d8), 0.2)] },

  // Pastel
  { id: 'algodao', name: 'Algodão', category: 'Pastel', ops: [fade(0.06, 1), saturate(0.78), warm(0.05), curve([0, 0], [0.5, 0.56], [1, 1])] },
  { id: 'giz', name: 'Giz', category: 'Pastel', ops: [fade(0.1, 0.97), saturate(0.68)] },
  { id: 'lavanda', name: 'Lavanda', category: 'Pastel', ops: [split(hex(0x7a6a9a), hex(0xfff0fa), 0.15), fade(0.05, 1), saturate(0.82)] },
  { id: 'pessego', name: 'Pêssego', category: 'Pastel', ops: [split(hex(0x9a6a6a), hex(0xffe0c8), 0.16), fade(0.05, 1), saturate(0.86)] },

  // Noite
  { id: 'neon-baixo', name: 'Neon Baixo', category: 'Noite', ops: [split(hex(0x503a90), hex(0xff9ad0), 0.2), curve(...STRONG_S), saturate(1.12)] },
  { id: 'azul-noite', name: 'Azul Noite', category: 'Noite', ops: [warm(-0.2), curve([0, 0], [0.5, 0.42], [1, 0.96]), saturate(0.9)] },
  { id: 'balcao', name: 'Balcão', category: 'Noite', ops: [warm(0.2), curve([0, 0], [0.4, 0.33], [0.8, 0.85], [1, 1]), split(hex(0x3a2a50), hex(0xffc080), 0.14)] },
  { id: 'luz-de-rua', name: 'Luz de Rua', category: 'Noite', ops: [split(hex(0x204a58), hex(0xffb060), 0.22), curve(...SOFT_S), saturate(0.95)] },

  // Retrô
  { id: 'verao-78', name: 'Verão 78', category: 'Retrô', ops: [curve(...MATTE), warm(0.2), split(hex(0x5a3a60), hex(0xffd890), 0.16), saturate(1.06)] },
  { id: 'album', name: 'Álbum', category: 'Retrô', ops: [fade(0.08, 0.93), warm(0.14), saturate(0.75)] },
  {
    id: 'cruzado',
    name: 'Cruzado',
    category: 'Retrô',
    ops: [
      rgbCurves(
        [[0, 0], [0.3, 0.22], [0.7, 0.8], [1, 1]],
        [[0, 0.03], [0.5, 0.53], [1, 0.97]],
        [[0, 0.14], [0.5, 0.46], [1, 0.84]],
      ),
      saturate(1.1),
    ],
  },
  { id: 'desbotado', name: 'Desbotado', category: 'Retrô', ops: [fade(0.12, 0.9), saturate(0.7), split(hex(0x6a6a50), hex(0xfff0d8), 0.08)] },

  // Editorial
  { id: 'capa', name: 'Capa', category: 'Editorial', ops: [curve(...STRONG_S), saturate(0.94), warm(0.03)] },
  { id: 'contraste-seco', name: 'Contraste Seco', category: 'Editorial', ops: [saturate(0.72), curve(...STRONG_S)] },
  { id: 'sombra-fria', name: 'Sombra Fria', category: 'Editorial', ops: [split(hex(0x2a4a68), hex(0xfff8f0), 0.2), curve(...SOFT_S), saturate(0.9)] },
  { id: 'bronze', name: 'Bronze', category: 'Editorial', ops: [split(hex(0x4a3020), hex(0xffd8a8), 0.18), curve(...STRONG_S), saturate(0.98)] },

  // Sonho
  { id: 'aurora', name: 'Aurora', category: 'Sonho', ops: [split(hex(0x5a70b0), hex(0xffc8e0), 0.17), fade(0.04, 1), saturate(1.04)] },
  { id: 'rosa-bruma', name: 'Rosa Bruma', category: 'Sonho', ops: [split(hex(0x9a5a7a), hex(0xffe8e8), 0.16), fade(0.07, 1), saturate(0.9)] },
  { id: 'veu', name: 'Véu', category: 'Sonho', ops: [fade(0.09, 1), curve([0, 0], [0.5, 0.58], [1, 1]), saturate(0.88), warm(0.04)] },
  { id: 'lilas', name: 'Lilás', category: 'Sonho', ops: [split(hex(0x6a5aa0), hex(0xf8e8ff), 0.2), curve(...SOFT_S), saturate(0.94)] },
];

export const lutById = (id: string) => LUTS.find((l) => l.id === id);

/** Evaluates a recipe over an N-cubed grid. R varies fastest. Output is RGBA float. */
export function buildLut(recipe: LutRecipe, size = 33): Float32Array {
  const data = new Float32Array(size * size * size * 4);
  const k = 1 / (size - 1);
  let i = 0;
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        let c: RGB = [r * k, g * k, b * k];
        for (const op of recipe.ops) c = op(c);
        data[i++] = clamp(c[0]);
        data[i++] = clamp(c[1]);
        data[i++] = clamp(c[2]);
        data[i++] = 1;
      }
    }
  }
  return data;
}
