/** Brilhos: four-pointed sparkles and small dots floating around the head, drawn for the project. */

import type { StickerDef } from '../types';
import { RING, ringSpots, sparkle } from './shapes';
import { aroundHead } from './spots';

const COLORS = ['#ffffff', '#fff3b0', '#c9f2ff'];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${RING.w} ${RING.h}">
  <g stroke="#ffcf4a" stroke-opacity="0.8" stroke-width="2" stroke-linejoin="round">${ringSpots()
    .map((s, i) => {
      const glint = `<path d="${sparkle(s.x, s.y, 26 * s.size)}" fill="${COLORS[i % COLORS.length]}"/>`;
      // A small dot beside every other sparkle, off the ring.
      const dot = i % 2 ? `<circle cx="${(s.x + (s.x > RING.cx ? -22 : 22)).toFixed(1)}" cy="${(s.y + 18).toFixed(1)}" r="4" fill="#fff"/>` : '';
      return glint + dot;
    })
    .join('')}</g>
</svg>`;

export const brilhos: StickerDef = {
  id: 'brilhos',
  label: 'Brilhos',
  group: 'volta',
  svg,
  aspect: RING.h / RING.w,
  anchor: (read) => aroundHead(read, RING.rx / RING.w, RING.h / RING.w, RING.cx / RING.w, RING.cy / RING.h),
};
