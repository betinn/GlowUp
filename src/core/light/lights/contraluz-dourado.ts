import type { MenuLight } from '../types';

/** The last sun behind the person: the place goes dark and the hair lights up in gold. */
export const contraluzDourado: MenuLight = {
  id: 'contraluz-dourado',
  label: 'Contraluz Dourado',
  note: 'Fim de tarde por trás, com fios dourados.',
  swatch: ['#ffc56b', '#2a2018'],
  recipe: {
    far: { ev: -3.6, level: 0.307, adapt: 0.8, keep: 0.3, sat: 1.2 },
    near: { ev: -1, level: 0.108, adapt: 1, sat: 1.15 },
    skin: { sat: 1.2 },
    lamp: { at: [-0.9, 0.5], reach: 0.65, glow: 0.3, hug: 0.02, glowColor: [1.6, 0.88, 0.42], strands: 2, strandColor: [1.35, 0.98, 0.6] },
    film: { gamma: 1.1, knee: 0.9, vignette: 0.5, grain: 0.12 },
  },
};
