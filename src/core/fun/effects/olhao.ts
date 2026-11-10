/** Olhão: eyes as big as a cartoon's. Each eye grows around its middle, with the lids and the lashes. */

import { eyesOf, magnify } from '../kit';
import type { FunEffect } from '../types';

/** At the end of the slider the middle of an eye is this much bigger. */
const MOST = 2;
/** How far around an eye the warp reaches, in widths of the eye. Past about 1.3 the two eyes meet over the nose. */
const REACH = 1.2;

export const olhao: FunEffect = {
  id: 'olhao',
  label: 'Olhão',
  note: 'Olhos de desenho animado.',
  pieces(read, strength) {
    const k = (1 - 1 / MOST) * Math.min(1, Math.max(0, strength));
    if (k <= 0) return [];
    return eyesOf(read).map((eye) => magnify(eye.c, eye.width * REACH, k));
  },
};
