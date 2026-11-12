/**
 * The lights of the looks of Glow na Hora. They are retouch, not a new scene: each one measures the photo and
 * moves only what needs it. A face in the dark comes up and a face already lit stays, a bright background steps
 * back and a dark one stays. No menu shows them: a look names one in `src/presets/recipes.ts`.
 */

import type { LightDef } from './types';

/** The person stands out: the background steps back a little, and the shadows on the face ease. */
const retrato: LightDef = {
  id: 'look-retrato',
  recipe: {
    far: { ev: -0.2, level: 0.2, adapt: 0.5, only: 'down', limit: 0.35, sat: 0.9 },
    near: { level: 0.2, adapt: 0.6, only: 'up', limit: 0.6 },
    skin: { fill: 0.3 },
  },
};

/** A window in front of the face: soft light on the skin, and the place as it was. */
const janela: LightDef = {
  id: 'look-janela',
  recipe: {
    near: { level: 0.24, adapt: 0.7, only: 'up', limit: 0.8 },
    skin: { ev: 0.08, fill: 0.5 },
  },
};

/** Candles: the place dims and warms, and the skin keeps a warm light of its own. */
const vela: LightDef = {
  id: 'look-vela',
  recipe: {
    fall: { lo: 0.15, hi: 0.95 },
    far: { ev: -0.5, level: 0.16, adapt: 0.6, only: 'down', limit: 0.5, sat: 0.8, tint: [1.12, 0.98, 0.84] },
    near: { level: 0.2, adapt: 0.6, only: 'up', limit: 0.5, sat: 1.05, tint: [1.05, 1, 0.93] },
    skin: { ev: 0.12, fill: 0.25 },
    film: { knee: 0.7, vignette: 0.25 },
  },
};

/** The end of the afternoon: a low sun warms everything, the person a little more than the place. */
const dourado: LightDef = {
  id: 'look-dourado',
  recipe: {
    far: { ev: -0.25, level: 0.22, adapt: 0.5, only: 'down', limit: 0.4, tint: [1.12, 1, 0.84] },
    near: { level: 0.2, adapt: 0.5, only: 'up', limit: 0.5, tint: [1.04, 1, 0.94] },
    skin: { fill: 0.2 },
    film: { knee: 0.8 },
  },
};

export const LOOK_LIGHTS: readonly LightDef[] = [retrato, janela, vela, dourado];
