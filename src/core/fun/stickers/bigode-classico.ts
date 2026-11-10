/** Bigode clássico: a full, brushy mustache, drawn for the project. It sits over the upper lip. */

import type { StickerDef } from '../types';
import { twice } from './shapes';
import { overLip } from './spots';

const W = 240;
const H = 90;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">${twice(`
  <path d="M120 24C104 12 70 10 46 26C30 38 18 56 6 74C30 74 56 66 80 60C98 56 110 54 120 58Z" fill="#3a2618" stroke="#24170e" stroke-width="3" stroke-linejoin="round"/>
  <path d="M104 28C96 36 92 44 90 52M86 24C76 34 70 44 66 56M66 24C56 34 48 46 42 60M46 34C38 44 30 56 24 66" fill="none" stroke="#5a3b25" stroke-width="3" stroke-linecap="round"/>`, W)}
</svg>`;

export const bigodeClassico: StickerDef = {
  id: 'bigode-classico',
  label: 'Bigode clássico',
  group: 'rosto',
  svg,
  aspect: H / W,
  anchor: (read) => overLip(read, 1.4, H / W, 0.5, 56 / H),
};
