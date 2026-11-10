/** Queixão: a chin that goes on and on. The face stretches from under the lips down, and the chin goes down over the neck. */

import type { FunEffect } from '../types';
import { lengthen, toFrame } from '../warps';

/** At the end of the slider the chin goes down by this share of the length of the face. */
const MOST = 0.16;

export const queixao: FunEffect = {
  id: 'queixao',
  label: 'Queixão',
  note: 'O queixo desce, e o pescoço fica.',
  layered: true,
  pieces(read, strength) {
    const s = Math.min(1, Math.max(0, strength));
    const lips = read.face.parts.outerLips;
    if (s <= 0 || lips.length < 20) return [];
    const f = read.frame;
    // A little under the lower lip, so the lips keep their shape.
    const under = toFrame(f, ...read.flat(lips[5]))[0] + 0.03;
    if (!(under < 0.97)) return [];
    return [lengthen(f, { way: 1, from: under, end: 1, amount: MOST * s, hold: 0.08, fade: 0.55, inner: 0.55, outer: 1.35, alone: true })];
  },
};
