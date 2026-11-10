/** Óculos de estrela: star lenses with a gold frame, drawn for the project. They sit on the line of the eyes. */

import type { StickerDef } from '../types';
import { star, twice } from './shapes';
import { onEyes } from './spots';

const W = 300;
const H = 130;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <g stroke-linecap="round" stroke-linejoin="round">${twice(`
    <path d="M18 56L3 50" fill="none" stroke="#c98a00" stroke-width="7"/>
    <path d="${star(75, 68, 64, 5, 0.5)}" fill="#ffe066" fill-opacity="0.45" stroke="#f2a900" stroke-width="8"/>
    <path d="M62 38L70 26" fill="none" stroke="#fff" stroke-opacity="0.85" stroke-width="5"/>`, W)}
    <path d="M133 52Q150 42 167 52" fill="none" stroke="#f2a900" stroke-width="8"/>
  </g>
</svg>`;

export const oculosEstrela: StickerDef = {
  id: 'oculos-estrela',
  label: 'Óculos de estrela',
  group: 'oculos',
  svg,
  aspect: H / W,
  anchor: (read) => onEyes(read, 150 / W, H / W, 70 / H),
};
