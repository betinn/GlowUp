/** Esticado: a head pulled long, as in a fun-house mirror. Taller and a little narrower, over the body and the background, which stay. */

import type { FunEffect } from '../types';
import { reshapeHead } from '../warps';

/** At the end of the slider the head is this many times as long and as wide. */
const ALONG = 1.35;
const ACROSS = 0.88;

export const esticado: FunEffect = {
  id: 'esticado',
  label: 'Esticado',
  note: 'Espelho de parque de diversões.',
  layered: true,
  pieces(read, strength) {
    const s = Math.min(1, Math.max(0, strength));
    if (s <= 0) return [];
    return [reshapeHead(read.frame, 1 + (ALONG - 1) * s, 1 + (ACROSS - 1) * s)];
  },
};
