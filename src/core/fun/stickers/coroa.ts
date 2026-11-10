/** Coroa: a gold crown with three tips and jewels, drawn for the project. It sits on the top of the head. */

import type { StickerDef } from '../types';
import { onHead } from './spots';

const W = 240;
const H = 160;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffe27a"/>
      <stop offset="1" stop-color="#e9a90f"/>
    </linearGradient>
  </defs>
  <g stroke="#a86e00" stroke-width="5" stroke-linejoin="round">
    <path d="M24 146L24 108L14 44L66 84L120 24L174 84L226 44L216 108L216 146Z" fill="url(#gold)"/>
    <path d="M24 112L216 112L216 146L24 146Z" fill="#f0b31c"/>
    <circle cx="14" cy="38" r="10" fill="#ffe27a"/>
    <circle cx="120" cy="17" r="11" fill="#ffe27a"/>
    <circle cx="226" cy="38" r="10" fill="#ffe27a"/>
    <circle cx="72" cy="129" r="9" fill="#e5304b" stroke="#9e1027" stroke-width="3"/>
    <path d="M120 117L131 129L120 141L109 129Z" fill="#2fa8e6" stroke="#15659a" stroke-width="3"/>
    <circle cx="168" cy="129" r="9" fill="#2fbf71" stroke="#13784a" stroke-width="3"/>
  </g>
  <path d="M40 100L33 62" stroke="#fff" stroke-opacity="0.6" stroke-width="5" stroke-linecap="round"/>
  <path d="M108 72L118 46" stroke="#fff" stroke-opacity="0.5" stroke-width="5" stroke-linecap="round"/>
</svg>`;

export const coroa: StickerDef = {
  id: 'coroa',
  label: 'Coroa',
  group: 'cabeca',
  svg,
  aspect: H / W,
  anchor: (read) => onHead(read, 0.66, H / W, 0.5, 146 / H, 0.1),
};
