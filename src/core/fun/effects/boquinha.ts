/** Boquinha: a tiny mouth. The lips shrink around their middle, and the skin around them closes in. */

import type { FunEffect } from '../types';
import { bulge, mouthOf } from '../warps';

/** At the end of the slider the middle of the mouth shows this much smaller. */
const LEAST = 0.62;

export const boquinha: FunEffect = {
  id: 'boquinha',
  label: 'Boquinha',
  note: 'Uma boca de boneca.',
  pieces(read, strength) {
    const s = Math.min(1, Math.max(0, strength));
    const mouth = mouthOf(read);
    if (s <= 0 || !mouth) return [];
    // Short of the nose above and of the chin below.
    const b = Math.max(mouth.half * 1.05, mouth.height * 1.5);
    return [bulge({ c: mouth.c, e1: mouth.e1, a: mouth.half * 1.7, b }, (1 - 1 / LEAST) * s)];
  },
};
