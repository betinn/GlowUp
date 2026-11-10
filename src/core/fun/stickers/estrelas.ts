/** Estrelas: little stars floating around the head, drawn for the project. */

import type { StickerDef } from '../types';
import { RING, ringSpots, star } from './shapes';
import { aroundHead } from './spots';

const COLORS = ['#ffd23f', '#ffb627', '#fff07a'];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${RING.w} ${RING.h}">
  <g stroke="#e08e00" stroke-width="3" stroke-linejoin="round">${ringSpots()
    .map((s, i) => `<path d="${star(s.x, s.y, 24 * s.size, 5, 0.48, s.turn)}" fill="${COLORS[i % COLORS.length]}"/>`)
    .join('')}</g>
</svg>`;

export const estrelas: StickerDef = {
  id: 'estrelas',
  label: 'Estrelas',
  group: 'volta',
  svg,
  aspect: RING.h / RING.w,
  anchor: (read) => aroundHead(read, RING.rx / RING.w, RING.h / RING.w, RING.cx / RING.w, RING.cy / RING.h),
};
