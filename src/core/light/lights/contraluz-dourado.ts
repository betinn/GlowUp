import type { LightDef } from '../types';

/** The last sun behind the person: a golden line on hair and shoulders, the place gone to evening. */
export const contraluzDourado: LightDef = {
  id: 'contraluz-dourado',
  label: 'Contraluz Dourado',
  note: 'Fim de tarde por trás, com borda dourada.',
  swatch: ['#ffc56b', '#2a2018'],
  recipe: {
    back: { ev: -4.4, near: -3.0, reach: 0.12, level: 0.02, adapt: 0.5, keep: 0.5, tint: [1.2, 0.97, 0.7] },
    person: { ev: -0.9 },
    skin: { tint: [1.12, 0.93, 0.76] },
    rim: { strength: 0.5, width: 0.04, color: [1, 0.72, 0.36], hair: 0.6, lamp: { at: [-0.6, 0.2], reach: 1.8 }, halo: 0.05, haloWidth: 0.35 },
  },
};
