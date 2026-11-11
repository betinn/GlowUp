import type { LightDef } from '../types';

/** A strong light behind the person in a dark room: the front falls into shade and the hair glows. */
export const silhueta: LightDef = {
  id: 'silhueta',
  label: 'Silhueta',
  note: 'Luz forte por trás: rosto na sombra, fios acesos.',
  swatch: ['#f2f2f2', '#2a2a2c'],
  recipe: {
    fall: { lo: 0.5, hi: 0.9 },
    far: { ev: -1.9, level: 0.287, adapt: 0.8, sat: 0.9 },
    near: { ev: -1.3, level: 0.129, adapt: 0.8, sat: 1.25 },
    skin: { fill: 0.3 },
    lamp: { at: [-1.2, 0.2], reach: 1.1, glow: 0.8, hug: 0.04, glowColor: [1.1, 1, 0.9], strands: 2.4, strandColor: [1.1, 1, 0.85] },
    film: { gamma: 1.35, vignette: 0.7, grain: 0.25 },
  },
};
