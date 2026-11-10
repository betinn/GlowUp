/** Testão: a forehead as tall as a wall. The face stretches from over the brows up, and the hair goes up with it. */

import type { FunEffect } from '../types';
import { browTop, lengthen } from '../warps';

/** At the end of the slider the top of the head goes up by this share of the length of the face. */
const MOST = 0.24;

export const testao: FunEffect = {
  id: 'testao',
  label: 'Testão',
  note: 'A testa sobe, e o cabelo vai junto.',
  layered: true,
  pieces(read, strength) {
    const s = Math.min(1, Math.max(0, strength));
    const brows = browTop(read);
    if (s <= 0 || brows === null) return [];
    // A little over the brows, so the brows keep their shape.
    const over = brows - 0.02;
    if (!(over > 0.05)) return [];
    // The stretch goes on into the hair, so a fringe over the forehead stretches no more than the skin does.
    return [lengthen(read.frame, { way: -1, from: over, end: -0.3, amount: MOST * s, hold: 0.6, fade: 0.6, inner: 1, outer: 2, alone: true })];
  },
};
