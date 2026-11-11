import type { LightDef } from '../types';

/** A lamp behind the person: a white line around the hair and the shoulders, a glow on the wall, and the front in shade. */
export const contraluz: LightDef = {
  id: 'contraluz',
  label: 'Contraluz',
  note: 'Uma luz atrás de você desenha o cabelo.',
  swatch: ['#fff4e0', '#5a1016'],
  recipe: {
    back: { ev: -0.6, near: -0.2, reach: 0.1, sat: 0.85 },
    person: { ev: -0.95 },
    rim: { strength: 0.75, width: 0.035, color: [1, 0.95, 0.85], hair: 0.85, lamp: { at: [0, 1.0], reach: 1.5 }, halo: 0.1, haloWidth: 0.35, haloColor: [1, 0.8, 0.65] },
  },
};
