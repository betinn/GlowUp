/** Nariz de palhaço: a round red nose, drawn for the project. It sits on the tip of the nose. */

import type { StickerDef } from '../types';
import { pin, poseOf, noseOf } from './spots';

const W = 120;
const H = 120;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="ball" cx="0.38" cy="0.34" r="0.7">
      <stop offset="0" stop-color="#ff7a6e"/>
      <stop offset="0.6" stop-color="#e3201f"/>
      <stop offset="1" stop-color="#a50f14"/>
    </radialGradient>
  </defs>
  <circle cx="60" cy="60" r="55" fill="url(#ball)" stroke="#8a0b10" stroke-width="3"/>
  <ellipse cx="42" cy="38" rx="15" ry="10" transform="rotate(-30 42 38)" fill="#fff" fill-opacity="0.7"/>
</svg>`;

export const narizPalhaco: StickerDef = {
  id: 'nariz-palhaco',
  label: 'Nariz de palhaço',
  group: 'rosto',
  svg,
  aspect: H / W,
  anchor(read) {
    const nose = noseOf(read);
    if (!nose) return null;
    return pin(nose.tip, poseOf(read), nose.width * 1.3, H / W, 0.5, 0.45);
  },
};
