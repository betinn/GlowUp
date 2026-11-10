/** Boné: a plain cap seen from the front, with no mark on it, drawn for the project. It sits on the forehead. */

import type { StickerDef } from '../types';
import { onHead } from './spots';

const W = 260;
const H = 180;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <g stroke="#123a73" stroke-width="5" stroke-linejoin="round">
    <path d="M30 130Q28 26 130 20Q232 26 230 130Z" fill="#2f7de1"/>
    <path d="M130 22Q100 70 98 128M130 22Q160 70 162 128" fill="none" stroke-width="3"/>
    <circle cx="130" cy="20" r="9" fill="#2f7de1"/>
    <path d="M8 136Q130 100 252 136Q244 172 130 174Q16 172 8 136Z" fill="#2566c4"/>
  </g>
  <path d="M60 104Q62 60 104 40" fill="none" stroke="#fff" stroke-opacity="0.25" stroke-width="8" stroke-linecap="round"/>
  <path d="M40 142Q130 118 220 142" fill="none" stroke="#fff" stroke-opacity="0.18" stroke-width="5" stroke-linecap="round"/>
</svg>`;

export const bone: StickerDef = {
  id: 'bone',
  label: 'Boné',
  group: 'cabeca',
  svg,
  aspect: H / W,
  anchor: (read) => onHead(read, 1.12, H / W, 0.5, 172 / H, 0.34),
};
