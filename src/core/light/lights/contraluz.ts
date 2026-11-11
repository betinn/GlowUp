import type { LightDef } from '../types';

/** A lamp behind the person: the wall burns beside them and the strands of hair catch the light. */
export const contraluz: LightDef = {
  id: 'contraluz',
  label: 'Contraluz',
  note: 'Uma luz atrás de você acende o cabelo.',
  swatch: ['#fff4e0', '#5a1016'],
  recipe: {
    far: { ev: 0.1, level: 0.015, adapt: 0.8, tint: [0.85, 1.03, 1.08] },
    near: { ev: -0.3, level: 0.274, adapt: 0.8, sat: 0.85 },
    skin: { sat: 1.2 },
    lamp: { at: [-0.4, 1], reach: 0.65, glow: 0.7, glowColor: [1.25, 0.95, 0.8], strands: 1, strandColor: [1.1, 1, 0.85] },
    film: { gamma: 1.14, knee: 0.6, vignette: 0.6, grain: 0.25 },
  },
};
