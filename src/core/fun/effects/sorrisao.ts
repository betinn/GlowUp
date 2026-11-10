/** Sorrisão: a smile from ear to ear. The corners of the mouth go out and up, and the lips follow them. */

import type { FunEffect } from '../types';
import { mouthOf, slide } from '../warps';

/** At the end of the slider each corner goes out and up by these shares of half the width of the mouth. */
const OUT = 0.38;
const UP = 0.3;
/** How far around a corner the move reaches, in half widths of the mouth. */
const REACH = 1.35;

export const sorrisao: FunEffect = {
  id: 'sorrisao',
  label: 'Sorrisão',
  note: 'Um sorriso de orelha a orelha.',
  pieces(read, strength) {
    const s = Math.min(1, Math.max(0, strength));
    const mouth = mouthOf(read);
    if (s <= 0 || !mouth) return [];
    const f = read.frame;
    const [ex, ey] = mouth.e1;
    return mouth.corners.map((corner, i) => {
      const way = i === 0 ? -1 : 1;
      const v: [number, number] = [(way * ex * OUT - f.dx * UP) * mouth.half * s, (way * ey * OUT - f.dy * UP) * mouth.half * s];
      return slide(corner, v, mouth.half * REACH);
    });
  },
};
