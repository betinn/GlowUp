/** Cabeção: a bobblehead. The head with its hair grows over the body and the background, which stay. */

import { growHead } from '../kit';
import type { FunEffect } from '../types';

/** At the end of the slider the head is this much bigger. */
const MOST = 1.7;

export const cabecao: FunEffect = {
  id: 'cabecao',
  label: 'Cabeção',
  note: 'A cabeça cresce, e o corpo e o fundo ficam.',
  layered: true,
  pieces(read, strength) {
    const s = Math.min(1, Math.max(0, strength));
    if (s <= 0) return [];
    return [growHead(read.frame, 1 + (MOST - 1) * s)];
  },
};
