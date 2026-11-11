import type { LightDef } from '../types';

/** The flash of a film camera: a cold dark street, a burned subject, grain, and light that got into the camera. */
export const flashAnalogico: LightDef = {
  id: 'flash-analogico',
  label: 'Flash Analógico',
  note: 'Flash de câmera de filme, com vazamento de luz e grão.',
  swatch: ['#efe9df', '#16282b'],
  recipe: {
    fall: { lo: 0.1, hi: 0.9 },
    far: { ev: -3.55, level: 0.288, adapt: 0.8, sat: 0.27, tint: [0.554, 1.109, 1.233] },
    near: { ev: 2, hair: -1.1, level: 0.249, adapt: 1, sat: 0.89 },
    skin: { ev: 0.25, fill: 0.35, sat: 1.13 },
    film: { gamma: 1.29, black: 0.156, knee: 0.18, vignette: 0.78, vignetteY: 0.3, grain: 0.32, leak: { x: 0.007, y: 0.38, size: 0.072, strength: 1.23, color: [1, 0.92, 0.8] } },
  },
};
