/** Narizinho: a button nose. The nose shrinks around its ball, and the skin around it closes in. */

import type { FunEffect } from '../types';
import { bulge, noseOf } from '../warps';

/** At the end of the slider the ball of the nose shows this much smaller. */
const LEAST = 0.6;

export const narizinho: FunEffect = {
  id: 'narizinho',
  label: 'Narizinho',
  note: 'Um nariz de botão.',
  pieces(read, strength) {
    const s = Math.min(1, Math.max(0, strength));
    const nose = noseOf(read);
    if (s <= 0 || !nose) return [];
    return [bulge({ c: nose.c, e1: nose.e1, a: nose.half * 2, b: nose.length * 1.05 }, (1 - 1 / LEAST) * s)];
  },
};
