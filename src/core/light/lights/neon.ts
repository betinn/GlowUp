import type { LightDef } from '../types';

/** A night of colored signs: the place goes blue on one side and magenta on the other. */
export const neon: LightDef = {
  id: 'neon',
  label: 'Néon',
  note: 'Noite de néon: azul de um lado, magenta do outro.',
  swatch: ['#28c3e6', '#b04ad8'],
  recipe: {
    fall: { lo: 0.16, hi: 1 },
    far: { ev: -1.67, level: 0.235, adapt: 0.8, sat: 0, duo: { left: [0.037, 1.153, 2.321], right: [1.099, 0.781, 2.872], amount: 0.96 } },
    near: { ev: -0.71, level: 0.242, adapt: 1, sat: 1.6, tint: [0.726, 0.92, 2.601] },
    film: { gamma: 1.35, knee: 0.31, grain: 0.12 },
  },
};
