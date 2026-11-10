/** Óculos aviador: drop lenses with a thin gold frame and a double bridge, drawn for the project. */

import type { StickerDef } from '../types';
import { twice } from './shapes';
import { onEyes } from './spots';

const W = 300;
const H = 116;

const lens = 'M20 32Q22 17 48 17L116 19Q133 21 131 40Q127 76 100 95Q84 105 66 101Q29 93 21 58Z';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="tint" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4a3322"/>
      <stop offset="0.55" stop-color="#9c6b3f"/>
      <stop offset="1" stop-color="#e6bd86"/>
    </linearGradient>
  </defs>
  <g stroke-linecap="round" stroke-linejoin="round">${twice(`
    <path d="M21 30L3 27" fill="none" stroke="#b08a2e" stroke-width="5"/>
    <path d="${lens}" fill="url(#tint)" fill-opacity="0.82" stroke="#c9a23a" stroke-width="5"/>
    <path d="M40 30Q52 24 66 25" fill="none" stroke="#fff" stroke-opacity="0.55" stroke-width="5"/>`, W)}
    <path d="M116 20L184 20" fill="none" stroke="#c9a23a" stroke-width="5"/>
    <path d="M130 38Q150 30 170 38" fill="none" stroke="#c9a23a" stroke-width="5"/>
  </g>
</svg>`;

export const oculosAviador: StickerDef = {
  id: 'oculos-aviador',
  label: 'Óculos aviador',
  group: 'oculos',
  svg,
  aspect: H / W,
  anchor: (read) => onEyes(read, 150 / W, H / W, 56 / H),
};
