import type { LightDef } from '../types';

/** A compact camera at dusk: the street goes blue and dark, the person keeps their light, and the date is printed. */
export const analogica: LightDef = {
  id: 'analogica',
  label: 'Analógica',
  note: 'Câmera antiga à noite, com a data no canto.',
  swatch: ['#d8b79a', '#15181c'],
  recipe: {
    fall: { lo: 0.42, hi: 0.73 },
    far: { ev: -2.35, level: 0.137, adapt: 0.8, sat: 1.29, tint: [0.604, 1.044, 1.734] },
    near: { ev: 0.09, level: 0.291, adapt: 1, sat: 0.78 },
    skin: { ev: 0.45, fill: 0.1, sat: 1.18 },
    film: { gamma: 1.15, black: 0.015, knee: 0.055, vignette: 0.7, grain: 0.1, stamp: true },
  },
};
