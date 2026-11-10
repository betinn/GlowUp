/** Narigão: a clown's nose. The ball of the nose grows whole, and the cheeks around it make room. */

import type { FunEffect } from '../types';
import { noseOf, zoom } from '../warps';

/** At the end of the slider the nose is this much bigger. */
const MOST = 1.8;

export const narigao: FunEffect = {
  id: 'narigao',
  label: 'Narigão',
  note: 'Um nariz de palhaço.',
  pieces(read, strength) {
    const s = Math.min(1, Math.max(0, strength));
    const nose = noseOf(read);
    if (s <= 0 || !nose) return [];
    // Wide enough that the wings grow too, short of the eyes and the lips.
    return [zoom({ c: nose.c, e1: nose.e1, a: nose.half * 2.3, b: nose.length * 1.05 }, 1 + (MOST - 1) * s, 0.35)];
  },
};
