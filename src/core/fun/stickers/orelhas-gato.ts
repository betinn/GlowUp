/** Orelhas de gato: two pointed ears with pink insides, drawn for the project. They stand on the head. */

import type { StickerDef } from '../types';
import { twice } from './shapes';
import { onHead } from './spots';

const W = 300;
const H = 140;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <g stroke-linejoin="round">${twice(`
    <path d="M30 132L50 16L132 106Z" fill="#4b403b" stroke="#2c2522" stroke-width="10"/>
    <path d="M50 118L60 48L110 104Z" fill="#ff9fb6" stroke="#ff9fb6" stroke-width="8"/>`, W)}
  </g>
</svg>`;

export const orelhasGato: StickerDef = {
  id: 'orelhas-gato',
  label: 'Orelhas de gato',
  group: 'cabeca',
  svg,
  aspect: H / W,
  anchor: (read) => onHead(read, 1.0, H / W, 0.5, 132 / H, 0.13),
};
