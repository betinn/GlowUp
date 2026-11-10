/** Achatado: a head pressed flat. Shorter and wider, over the body and the background, which stay. */

import type { FunEffect } from '../types';
import { reshapeHead } from '../warps';

/** At the end of the slider the head is this many times as long and as wide. */
const ALONG = 0.78;
const ACROSS = 1.15;

export const achatado: FunEffect = {
  id: 'achatado',
  label: 'Achatado',
  note: 'Cabeça amassada de cima para baixo.',
  layered: true,
  pieces(read, strength) {
    const s = Math.min(1, Math.max(0, strength));
    if (s <= 0) return [];
    return [reshapeHead(read.frame, 1 + (ALONG - 1) * s, 1 + (ACROSS - 1) * s)];
  },
};
