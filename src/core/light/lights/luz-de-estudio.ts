import type { LightDef } from '../types';

/** A neutral light on the person: skin loses a color cast and gets brighter, and the room behind goes quiet and gray. */
export const luzDeEstudio: LightDef = {
  id: 'luz-de-estudio',
  label: 'Luz de Estúdio',
  note: 'Pele clara e neutra, fundo discreto.',
  swatch: ['#e7c3a6', '#2f3a3a'],
  recipe: {
    back: { ev: -2.0, level: 0.044, adapt: 0.6, sat: 0.4, top: -0.5 },
    person: { ev: 0.75, hair: -1.0 },
    skin: { ev: 0.0, level: 0.27, adapt: 0.5, sat: 0.66, tint: [0.92, 1.07, 1.14] },
    flash: { ev: 0.2, radius: 1.6, knee: 0.8 },
  },
};
