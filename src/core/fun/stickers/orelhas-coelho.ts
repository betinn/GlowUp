/** Orelhas de coelho: two tall white ears, one a little bent, drawn for the project. They stand on the head. */

import type { StickerDef } from '../types';
import { onHead } from './spots';

const W = 260;
const H = 290;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <g stroke="#b9aea8" stroke-width="5" stroke-linejoin="round">
    <ellipse cx="88" cy="150" rx="38" ry="128" transform="rotate(-11 88 150)" fill="#f7f3f0"/>
    <ellipse cx="88" cy="160" rx="19" ry="98" transform="rotate(-11 88 160)" fill="#ffb3c4" stroke="none"/>
    <path d="M150 278Q148 140 176 98Q194 72 222 46Q236 34 240 50Q248 80 214 110Q196 130 194 278Z" fill="#f7f3f0"/>
    <path d="M162 272Q162 150 186 112Q206 86 226 58Q218 92 200 116Q182 146 180 272Z" fill="#ffb3c4" stroke="none"/>
  </g>
</svg>`;

export const orelhasCoelho: StickerDef = {
  id: 'orelhas-coelho',
  label: 'Orelhas de coelho',
  group: 'cabeca',
  svg,
  aspect: H / W,
  anchor: (read) => onHead(read, 0.8, H / W, 0.5, 272 / H, 0.13),
};
