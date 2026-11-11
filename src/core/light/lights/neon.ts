import type { LightDef } from '../types';

/** A night of colored signs: the place goes blue on one side and magenta on the other, with points of light in the haze. */
export const neon: LightDef = {
  id: 'neon',
  label: 'Néon',
  note: 'Noite de néon: azul de um lado, magenta do outro.',
  swatch: ['#28c3e6', '#b04ad8'],
  recipe: {
    back: { ev: -2.1, level: 0.06, adapt: 0.6, duo: { left: [0.04, 0.7, 1], right: [0.6, 0.22, 1], amount: 0.92 }, glows: { strength: 0.4, size: 0.011 } },
    person: { ev: -0.2, tint: [0.82, 0.96, 1.28] },
    rim: { strength: 0.08, width: 0.15, color: [0.2, 0.8, 1], from: [-1, 0] },
    frame: { vignette: 0.2 },
  },
};
