import type { LightDef } from '../types';

/** A flash on the camera at night: the face burns toward white and whatever is behind goes black. */
export const flashDireto: LightDef = {
  id: 'flash-direto',
  label: 'Flash Direto',
  note: 'Flash na cara e fundo preto, como foto de festa.',
  swatch: ['#f4efe6', '#0b0b0d'],
  recipe: {
    fall: { lo: 0.5, hi: 0.8 },
    far: { ev: -4, level: 0.076, adapt: 0.8, sat: 0.1, tint: [0.8, 1.07, 0.85] },
    near: { ev: 1.35, hair: 0.4, level: 0.179, adapt: 0.8, sat: 0.72 },
    skin: { ev: 2.2, fill: 0.5, sat: 1.4 },
    film: { gamma: 1.08, black: 0.013, knee: 0.03, vignette: 0.45, grain: 0.17 },
  },
};
