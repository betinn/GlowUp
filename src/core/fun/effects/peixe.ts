/** Cara de peixe: cheeks sucked in and lips pushed together. The cheeks sink, and the corners of the mouth close in. */

import type { FunEffect } from '../types';
import { bulge, cheeksOf, mouthOf, slide } from '../warps';

/** At the end of the slider the middle of a cheek shows this much smaller. */
const LEAST = 0.7;
/** And the outline beside it comes in by this share of half the width of the face. */
const IN = 0.12;
/** Each corner of the mouth comes in by this share of half the width of the mouth. */
const PUCKER = 0.3;

export const peixe: FunEffect = {
  id: 'peixe',
  label: 'Cara de peixe',
  note: 'Bochecha chupada e bico.',
  pieces(read, strength) {
    const s = Math.min(1, Math.max(0, strength));
    if (s <= 0) return [];
    const half = read.frame.halfWidth;
    const k = (1 - 1 / LEAST) * s;
    const cheeks = cheeksOf(read).flatMap((cheek) => [
      bulge({ c: cheek.c, e1: [1, 0], a: half * 0.42, b: half * 0.42 }, k),
      slide(cheek.edge, [-cheek.out[0] * IN * half * s, -cheek.out[1] * IN * half * s], half * 0.55),
    ]);
    const mouth = mouthOf(read);
    if (!mouth) return cheeks;
    const [ex, ey] = mouth.e1;
    const lips = mouth.corners.map((corner, i) => {
      const way = i === 0 ? 1 : -1;
      return slide(corner, [way * ex * PUCKER * mouth.half * s, way * ey * PUCKER * mouth.half * s], mouth.half * 1.2);
    });
    return [...cheeks, ...lips];
  },
};
