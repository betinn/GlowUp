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
    // Grown around a point near the upper lip, so the mouth grows down toward the chin, where there is room, more
    // than up into the nose.
    const c: [number, number] = [mouth.c[0] + (mouth.top[0] - mouth.c[0]) * 0.65, mouth.c[1] + (mouth.top[1] - mouth.c[1]) * 0.65];
    // Up only to the base of the nose, so the skin under the nose takes up the squeeze and the nose keeps its
    // shape. Never so short that the upper lip leaves the part that grows the same everywhere.
    const scale = 1 + (MOST - 1) * s;
    const lip = Math.hypot(mouth.top[0] - c[0], mouth.top[1] - c[1]);
    const base = read.face.parts.marks?.noseBase;
    let back = b;
    if (base) {
      const [nx, ny] = read.flat(base);
      // How far above the middle the nose is, across the line of the mouth.
      const up = (nx - c[0]) * mouth.e1[1] - (ny - c[1]) * mouth.e1[0];
      if (up > 0) back = Math.min(b, Math.max(up * 1.05, (lip * scale * 1.15) / FLAT));
    }
    return [zoom({ c, e1: mouth.e1, a: mouth.half * 2.4, b, back }, scale, FLAT)];
  },
};
