/**
 * Bocão: a huge mouth. The mouth grows whole, lips and teeth together and the same everywhere, so the teeth grow
 * and never stretch. The cheeks, the chin and the base of the nose make room around it.
 */

import type { FunEffect } from '../types';
import { mouthOf, zoom } from '../warps';

/** At the end of the slider the mouth is this much bigger. */
const MOST = 1.7;
/** Out to this share of the oval the mouth grows the same everywhere. The lips fit in it at the end of the slider. */
const FLAT = 0.55;

export const bocao: FunEffect = {
  id: 'bocao',
  label: 'Bocão',
  note: 'A boca cresce inteira, com os dentes.',
  pieces(read, strength) {
    const s = Math.min(1, Math.max(0, strength));
    const mouth = mouthOf(read);
    if (s <= 0 || !mouth) return [];
    const b = Math.max(mouth.half * 1.4, mouth.height * 2.2);
    return [zoom({ c: mouth.c, e1: mouth.e1, a: mouth.half * 2.4, b }, 1 + (MOST - 1) * s, FLAT)];
  },
};
