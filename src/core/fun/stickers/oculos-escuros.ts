/** Óculos escuros: dark lenses in a thick frame, drawn for the project. They sit on the line of the eyes. */

import type { StickerDef } from '../types';
import { twice } from './shapes';
import { onEyes } from './spots';

const W = 300;
const H = 110;

const lens = 'M20 30Q20 21 30 21L121 21Q132 21 131 32L127 60Q122 92 89 92L62 92Q28 92 23 61Z';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="tint" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#11141c"/>
      <stop offset="1" stop-color="#3b4356"/>
    </linearGradient>
  </defs>
  <g stroke-linecap="round" stroke-linejoin="round">${twice(`
    <path d="M22 30L3 27" fill="none" stroke="#111" stroke-width="8"/>
    <path d="${lens}" fill="url(#tint)" fill-opacity="0.93" stroke="#111" stroke-width="8"/>
    <path d="M44 32L64 32L42 76L30 76Z" fill="#fff" fill-opacity="0.22"/>
    <path d="M72 32L80 32L58 76L50 76Z" fill="#fff" fill-opacity="0.14"/>`, W)}
    <path d="M129 36Q150 25 171 36" fill="none" stroke="#111" stroke-width="9"/>
  </g>
</svg>`;

export const oculosEscuros: StickerDef = {
  id: 'oculos-escuros',
  label: 'Óculos escuros',
  group: 'oculos',
  svg,
  aspect: H / W,
  anchor: (read) => onEyes(read, 150 / W, H / W, 55 / H),
};
