/** Óculos de coração: heart lenses in pink, drawn for the project. They sit on the line of the eyes. */

import type { StickerDef } from '../types';
import { heart, twice } from './shapes';
import { onEyes } from './spots';

const W = 300;
const H = 124;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <g stroke-linecap="round" stroke-linejoin="round">${twice(`
    <path d="M18 44L3 38" fill="none" stroke="#c2185b" stroke-width="7"/>
    <path d="${heart(75, 62, 124)}" fill="#ff5c93" fill-opacity="0.5" stroke="#d81b60" stroke-width="8"/>
    <path d="M38 40Q46 28 60 30" fill="none" stroke="#fff" stroke-opacity="0.8" stroke-width="6"/>`, W)}
    <path d="M133 46Q150 36 167 46" fill="none" stroke="#d81b60" stroke-width="8"/>
  </g>
</svg>`;

export const oculosCoracao: StickerDef = {
  id: 'oculos-coracao',
  label: 'Óculos de coração',
  group: 'oculos',
  svg,
  aspect: H / W,
  anchor: (read) => onEyes(read, 150 / W, H / W, 58 / H),
};
