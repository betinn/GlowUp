/** Bochechas coradas: two soft pink blushes with little shine lines, drawn for the project. On the cheeks. */

import type { StickerDef } from '../types';
import { twice } from './shapes';
import { dist, mix, pin, poseOf, cheeksOf } from './spots';

const W = 300;
const H = 100;

/** The blushes are this many widths of the art apart, middle to middle. */
const SPAN = 220 / W;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="blush" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ff6f93" stop-opacity="0.62"/>
      <stop offset="0.6" stop-color="#ff7d9c" stop-opacity="0.36"/>
      <stop offset="1" stop-color="#ff8aa5" stop-opacity="0"/>
    </radialGradient>
  </defs>${twice(`
  <ellipse cx="40" cy="50" rx="40" ry="30" fill="url(#blush)"/>
  <path d="M24 42L18 56M38 42L32 56M52 42L46 56" stroke="#ff4f7c" stroke-opacity="0.55" stroke-width="3.5" stroke-linecap="round"/>`, W)}
</svg>`;

export const bochechas: StickerDef = {
  id: 'bochechas',
  label: 'Bochechas coradas',
  group: 'rosto',
  svg,
  aspect: H / W,
  anchor(read) {
    const cheeks = cheeksOf(read);
    if (!cheeks) return null;
    const apart = dist(cheeks[0], cheeks[1]);
    if (apart <= 0) return null;
    return pin(mix(cheeks[0], cheeks[1], 0.5), poseOf(read), apart / SPAN, H / W, 0.5, 0.5);
  },
};
