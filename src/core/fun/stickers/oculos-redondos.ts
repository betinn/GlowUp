/** Óculos redondos: plain round glasses, drawn for the project. They sit on the line of the eyes. */

import { eyesOf } from '../kit';
import type { StickerDef } from '../types';

/** The lenses are this many widths of the art apart, middle to middle. See the `viewBox` below. */
const LENS_SPAN = 150 / 300;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 110">
  <g fill="none" stroke-linecap="round">
    <path d="M14 46 Q6 44 2 50" stroke="#1d1a17" stroke-width="7"/>
    <path d="M286 46 Q294 44 298 50" stroke="#1d1a17" stroke-width="7"/>
    <circle cx="75" cy="55" r="45" fill="#bfe3ff" fill-opacity="0.18" stroke="#1d1a17" stroke-width="9"/>
    <circle cx="225" cy="55" r="45" fill="#bfe3ff" fill-opacity="0.18" stroke="#1d1a17" stroke-width="9"/>
    <path d="M121 50 Q150 36 179 50" stroke="#1d1a17" stroke-width="8"/>
    <path d="M52 32 Q62 24 76 23" stroke="#ffffff" stroke-opacity="0.75" stroke-width="5"/>
    <path d="M202 32 Q212 24 226 23" stroke="#ffffff" stroke-opacity="0.75" stroke-width="5"/>
  </g>
</svg>`;

export const oculosRedondos: StickerDef = {
  id: 'oculos-redondos',
  label: 'Óculos redondos',
  group: 'oculos',
  svg,
  aspect: 110 / 300,
  anchor(read) {
    const eyes = eyesOf(read);
    if (eyes.length < 2) return null;
    const [a, b] = [eyes[0].c, eyes[eyes.length - 1].c];
    const span = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (span <= 0) return null;
    return { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, size: span / LENS_SPAN, angle: Math.atan2(b[1] - a[1], b[0] - a[0]) };
  },
};
