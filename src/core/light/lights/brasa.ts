import type { MenuLight } from '../types';

/**
 * Night falls on the place, its lamps stay lit, and a warm light tans the person, as embers do. The id is the
 * name this light shipped with, Noite de Festa, and stays in saved projects.
 */
export const brasa: MenuLight = {
  id: 'noite-de-festa',
  label: 'Brasa',
  note: 'O fundo vira noite e a pele ganha luz quente, de brasa.',
  swatch: ['#d99a62', '#0d0f16'],
  recipe: {
    fall: { lo: 0.1, hi: 0.98 },
    far: { ev: -1.16, level: 0.155, adapt: 0.8, sat: 0.58, tint: [1.467, 0.914, 0.474] },
    near: { ev: -0.1, close: -0.15, hair: 0.6, level: 0.208, adapt: 1, sat: 1.2 },
    skin: { ev: 0.15, sat: 0.94 },
    film: { gamma: 1.42, black: 0.199, knee: 0.25, vignette: 0.45, grain: 0.22 },
  },
};
