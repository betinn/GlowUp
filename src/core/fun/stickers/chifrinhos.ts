/** Chifrinhos: two little red horns, drawn for the project. They stand on the head. */

import type { StickerDef } from '../types';
import { twice } from './shapes';
import { onHead } from './spots';

const W = 300;
const H = 124;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">${twice(`
  <path d="M56 118C56 80 44 46 22 14C68 30 98 66 110 114Z" fill="#e3262f" stroke="#951019" stroke-width="5" stroke-linejoin="round"/>
  <path d="M60 96C58 74 50 54 38 36" fill="none" stroke="#fff" stroke-opacity="0.45" stroke-width="6" stroke-linecap="round"/>`, W)}
</svg>`;

export const chifrinhos: StickerDef = {
  id: 'chifrinhos',
  label: 'Chifrinhos',
  group: 'cabeca',
  svg,
  aspect: H / W,
  anchor: (read) => onHead(read, 0.86, H / W, 0.5, 116 / H, 0.14),
};
