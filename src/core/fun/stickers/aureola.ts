/** Auréola: a glowing gold ring, drawn for the project. It floats over the head. */

import type { StickerDef } from '../types';
import { onHead } from './spots';

const W = 240;
const H = 84;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <ellipse cx="120" cy="42" rx="104" ry="25" fill="none" stroke="#fff3a6" stroke-opacity="0.45" stroke-width="30"/>
  <ellipse cx="120" cy="42" rx="104" ry="25" fill="none" stroke="#ffcf2e" stroke-width="13"/>
  <path d="M40 34Q80 18 132 18" fill="none" stroke="#fffbe0" stroke-width="5" stroke-linecap="round"/>
</svg>`;

export const aureola: StickerDef = {
  id: 'aureola',
  label: 'Auréola',
  group: 'cabeca',
  svg,
  aspect: H / W,
  anchor: (read) => onHead(read, 0.78, H / W, 0.5, 0.5, -0.16),
};
