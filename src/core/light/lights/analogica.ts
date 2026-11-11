import type { LightDef } from '../types';

/** A compact camera at night: a dark, cool street, skin without the orange, and the date in the corner. */
export const analogica: LightDef = {
  id: 'analogica',
  label: 'Analógica',
  note: 'Câmera antiga à noite, com a data no canto.',
  swatch: ['#d8b79a', '#15181c'],
  recipe: {
    back: { ev: -3.3, level: 0.013, adapt: 0.75, tint: [0.8, 1.04, 1.4] },
    person: { hair: -0.7, gamma: 1.12, pivot: 0.35, sat: 0.84, tint: [0.96, 1.02, 1.1], limb: 0.8 },
    skin: { ev: 0.3, sat: 0.9, tint: [0.97, 1.06, 0.98] },
    frame: { vignette: 0.3, grain: 0.18, stamp: true },
  },
};
