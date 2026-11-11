import type { LightDef } from '../types';

/** Dusk turned into night: the sky goes black, the lamps stay lit, and the person gets a warm light with more contrast. */
export const noiteDeFesta: LightDef = {
  id: 'noite-de-festa',
  label: 'Noite de Festa',
  note: 'O fundo vira noite e a pele ganha luz quente.',
  swatch: ['#d99a62', '#0d0f16'],
  recipe: {
    back: { ev: -4.4, near: -1.3, reach: 0.14, level: 0.006, adapt: 0.5, keep: 0.65, sat: 0.7, tint: [1.2, 1, 0.62], top: -0.8, bottom: 1.4 },
    person: { gamma: 1.5, pivot: 0.6, limb: 0.5 },
    skin: { ev: 0.35, tint: [1.12, 0.94, 0.76] },
    frame: { vignette: 0.2, grain: 0.12 },
  },
};
