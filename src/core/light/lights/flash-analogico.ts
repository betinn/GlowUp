import type { LightDef } from '../types';

/** A flash on a film camera: a pale face, a cold dark ground that still shows near the person, a leak and dust. */
export const flashAnalogico: LightDef = {
  id: 'flash-analogico',
  label: 'Flash Analógico',
  note: 'Flash de câmera de filme, com vazamento de luz e poeira.',
  swatch: ['#efe9df', '#16282b'],
  recipe: {
    back: { ev: -4.2, near: -2.2, reach: 0.12, level: 0.006, adapt: 0.6, tint: [0.84, 1.04, 1.12] },
    person: { ev: 1.3, hair: -1.2, gamma: 1.2, pivot: 0.06 },
    skin: { ev: 0.0, level: 0.6, adapt: 0.5, sat: 0.55, tint: [1.0, 1.0, 0.94] },
    flash: { ev: 0.5, radius: 1.8, knee: 0.42 },
    frame: { vignette: 0.5, grain: 0.32, dust: 0.6, leak: { x: 0.0, y: 0.2, size: 0.07, strength: 1.1, color: [1, 0.7, 0.42] } },
  },
};
