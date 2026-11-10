/** Corações: little hearts floating around the head, drawn for the project. */

import type { StickerDef } from '../types';
import { heart, RING, ringSpots } from './shapes';
import { aroundHead } from './spots';

const COLORS = ['#ff4f8b', '#ff86a8', '#e8174f'];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${RING.w} ${RING.h}">
  <g stroke="#fff" stroke-width="3" stroke-linejoin="round">${ringSpots()
    .map((s, i) => `<path d="${heart(s.x, s.y, 44 * s.size, s.turn)}" fill="${COLORS[i % COLORS.length]}"/>`)
    .join('')}</g>
</svg>`;

export const coracoes: StickerDef = {
  id: 'coracoes',
  label: 'Corações',
  group: 'volta',
  svg,
  aspect: RING.h / RING.w,
  anchor: (read) => aroundHead(read, RING.rx / RING.w, RING.h / RING.w, RING.cx / RING.w, RING.cy / RING.h),
};
