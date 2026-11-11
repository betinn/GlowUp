import type { LightDef } from '../types';

/** A flash at the end of the day: the place goes dark and cool, and the person stays in the light. */
export const entardecer: LightDef = {
  id: 'entardecer',
  label: 'Entardecer',
  note: 'O fundo escurece e você continua na luz.',
  swatch: ['#e3b48f', '#3c3f42'],
  recipe: {
    fall: { lo: 0.42, hi: 0.86 },
    far: { ev: -1.68, level: 0.318, adapt: 0.8, sat: 1.5, tint: [0.811, 1.046, 1.105] },
    near: { ev: 1.14, hair: -1.47, level: 0.192, adapt: 1, sat: 1.11 },
    skin: { ev: -0.16, fill: 0.55 },
    film: { gamma: 1.05, knee: 0.02, vignette: 0.8, grain: 0.15 },
  },
};
