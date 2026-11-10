/** Bochechas de esquilo: cheeks full of nuts. Each cheek swells, and the outline of the face goes out with it. */

import type { FunEffect } from '../types';
import { bulge, cheeksOf, slide } from '../warps';

/** At the end of the slider the middle of a cheek shows this much bigger. */
const MOST = 1.6;
/** And the outline beside it goes out by this share of half the width of the face. */
const OUT = 0.13;

export const bochechas: FunEffect = {
  id: 'bochechas',
  label: 'Bochechas de esquilo',
  note: 'Bochechas cheias de castanha.',
  pieces(read, strength) {
    const s = Math.min(1, Math.max(0, strength));
    if (s <= 0) return [];
    const half = read.frame.halfWidth;
    const k = (1 - 1 / MOST) * s;
    return cheeksOf(read).flatMap((cheek) => [
      bulge({ c: cheek.c, e1: [1, 0], a: half * 0.42, b: half * 0.42 }, k),
      slide(cheek.edge, [cheek.out[0] * OUT * half * s, cheek.out[1] * OUT * half * s], half * 0.55),
    ]);
  },
};
