/** Cartola: a tall black top hat with a red band, drawn for the project. It sits on the top of the head. */

import type { StickerDef } from '../types';
import { onHead } from './spots';

const W = 260;
const H = 230;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <g stroke="#08080b" stroke-width="5" stroke-linejoin="round">
    <ellipse cx="130" cy="194" rx="124" ry="26" fill="#25252d"/>
    <path d="M54 26Q130 10 206 26L194 190Q130 204 66 190Z" fill="#1d1d24"/>
    <path d="M59 146L201 146L197 182Q130 194 63 182Z" fill="#c8232c"/>
  </g>
  <ellipse cx="130" cy="25" rx="74" ry="12" fill="#2f2f39"/>
  <path d="M78 40L76 136" stroke="#fff" stroke-opacity="0.16" stroke-width="12" stroke-linecap="round"/>
  <path d="M28 200Q62 214 104 216" fill="none" stroke="#fff" stroke-opacity="0.14" stroke-width="6" stroke-linecap="round"/>
</svg>`;

export const cartola: StickerDef = {
  id: 'cartola',
  label: 'Cartola',
  group: 'cabeca',
  svg,
  aspect: H / W,
  anchor: (read) => onHead(read, 1.02, H / W, 0.5, 196 / H, 0.17),
};
