import type { LightDef } from '../types';

/** A soft flash when the day is almost gone: the place falls to half and the person stays as bright as before. */
export const entardecer: LightDef = {
  id: 'entardecer',
  label: 'Entardecer',
  note: 'O fundo escurece e você continua na luz.',
  swatch: ['#e3b48f', '#3c3f42'],
  recipe: {
    back: { ev: -2.3, level: 0.07, adapt: 0.7, sat: 0.8, tint: [0.92, 1.02, 1.04] },
    person: { ev: -0.15, hair: -0.5, limb: 0.8 },
    skin: { ev: 0.1, tint: [0.9, 1.07, 1.0] },
    flash: { ev: 0.45, radius: 1.4 },
    frame: { vignette: 0.15 },
  },
};
