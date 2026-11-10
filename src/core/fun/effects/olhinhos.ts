/** Olhinhos: eyes like two dots, the other way from Olhão. Each eye shrinks around its middle, with the lids and the lashes. */

import { eyesOf } from '../kit';
import type { FunEffect } from '../types';
import { bulge } from '../warps';

/** At the end of the slider the middle of an eye shows this much smaller. */
const LEAST = 0.6;
/** How far around an eye the warp reaches, in widths of the eye, short of where the two eyes would meet. */
const REACH = 1.15;

export const olhinhos: FunEffect = {
  id: 'olhinhos',
  label: 'Olhinhos',
  note: 'Olhos de botão.',
  pieces(read, strength) {
    const s = Math.min(1, Math.max(0, strength));
    if (s <= 0) return [];
    const k = (1 - 1 / LEAST) * s;
    return eyesOf(read).map((eye) => bulge({ c: eye.c, e1: [1, 0], a: eye.width * REACH, b: eye.width * REACH }, k));
  },
};
