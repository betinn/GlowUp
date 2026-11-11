import type { LightDef } from '../types';

/** A soft light from the camera in a room: the skin goes even and neutral, and the room steps back. */
export const luzDeEstudio: LightDef = {
  id: 'luz-de-estudio',
  label: 'Luz de Estúdio',
  note: 'Pele clara e neutra, fundo discreto.',
  swatch: ['#e7c3a6', '#2f3a3a'],
  recipe: {
    fall: { lo: 0.32, hi: 0.95 },
    far: { ev: -1.17, level: 0.174, adapt: 0.8, sat: 0.66, tint: [1.222, 0.97, 0.639] },
    near: { ev: 1.46, hair: -0.18, level: 0.167, adapt: 1, sat: 0.5 },
    skin: { ev: -0.06, fill: 0.4, sat: 1.5 },
    film: { gamma: 1.05, black: 0.036, knee: 0.075, vignette: 0.54, grain: 0.12 },
  },
};
