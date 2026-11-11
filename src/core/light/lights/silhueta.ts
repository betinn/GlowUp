import type { LightDef } from '../types';

/** A strong light from behind in a dark room: the face goes into shadow and every loose hair lights up. */
export const silhueta: LightDef = {
  id: 'silhueta',
  label: 'Silhueta',
  note: 'Luz forte por trás: rosto na sombra, fios acesos.',
  swatch: ['#f2f2f2', '#2a2a2c'],
  recipe: {
    back: { ev: -4.0, near: -1.9, reach: 0.13, level: 0.02, adapt: 0.4 },
    person: { ev: -1.7 },
    rim: { strength: 0.45, width: 0.05, color: [1, 1, 1], hair: 0.8, lamp: { at: [-0.7, 0.4], reach: 2.0 }, halo: 0.14, haloWidth: 0.6 },
  },
};
