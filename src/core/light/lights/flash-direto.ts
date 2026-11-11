import type { LightDef } from '../types';

/** A flash on the camera at night: the face burns toward white and whatever is behind goes black. */
export const flashDireto: LightDef = {
  id: 'flash-direto',
  label: 'Flash Direto',
  note: 'Flash na cara e fundo preto, como foto de festa.',
  swatch: ['#f4efe6', '#0b0b0d'],
  recipe: {
    back: { ev: -3.6, level: 0.005, adapt: 0.75, sat: 0.9 },
    person: { ev: 1.0, hair: 0.6, limb: 0.5 },
    skin: { ev: 0.7, level: 0.66, adapt: 0.5, sat: 0.66, tint: [1.0, 1.0, 0.92] },
    flash: { ev: 0.6, radius: 1.7, knee: 0.45 },
    frame: { vignette: 0.25, grain: 0.22, dust: 0.45 },
  },
};
