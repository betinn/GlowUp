import type { LightDef } from '../types';

/** Night falls on the place, its lamps stay lit, and a warm flash tans the person. */
export const noiteDeFesta: LightDef = {
  id: 'noite-de-festa',
  label: 'Noite de Festa',
  note: 'O fundo vira noite e a pele ganha luz quente.',
  swatch: ['#d99a62', '#0d0f16'],
  recipe: {
    fall: { lo: 0.1, hi: 0.98 },
    far: { ev: -1.16, level: 0.155, adapt: 0.8, sat: 0.58, tint: [1.467, 0.914, 0.474] },
    near: { ev: -0.1, close: -0.15, hair: 0.6, level: 0.208, adapt: 0.8, sat: 1.2 },
    skin: { ev: 0.15, sat: 0.94 },
    film: { gamma: 1.42, black: 0.199, knee: 0.25, vignette: 0.45, grain: 0.22 },
  },
};
