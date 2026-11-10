/** Bigode de guidão: a waxed mustache with curled ends, drawn for the project. It sits over the upper lip. */

import type { StickerDef } from '../types';
import { twice } from './shapes';
import { overLip } from './spots';

const W = 280;
const H = 100;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">${twice(`
  <path d="M140 38C120 24 92 28 70 42C56 51 44 54 32 50L32 58C48 66 66 64 82 60C106 54 124 54 140 62Z" fill="#2b1d14" stroke="#1a110b" stroke-width="3" stroke-linejoin="round"/>
  <path d="M34 54C16 54 8 36 18 26C28 16 44 24 38 36C34 42 26 40 26 34" fill="none" stroke="#2b1d14" stroke-width="8" stroke-linecap="round"/>
  <path d="M118 38C102 34 86 38 72 46" fill="none" stroke="#5a3d29" stroke-width="3" stroke-linecap="round"/>`, W)}
</svg>`;

export const bigodeGuidao: StickerDef = {
  id: 'bigode-guidao',
  label: 'Bigode de guidão',
  group: 'rosto',
  svg,
  aspect: H / W,
  anchor: (read) => overLip(read, 1.8, H / W, 0.5, 48 / H),
};
