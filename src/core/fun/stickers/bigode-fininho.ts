/** Bigode fininho: a thin pencil mustache, drawn for the project. It sits over the upper lip. */

import type { StickerDef } from '../types';
import { twice } from './shapes';
import { overLip } from './spots';

const W = 240;
const H = 50;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">${twice(`
  <path d="M114 20C84 16 52 22 14 38C40 36 76 30 114 30Z" fill="#20160f" stroke="#20160f" stroke-width="3" stroke-linejoin="round"/>`, W)}
</svg>`;

export const bigodeFininho: StickerDef = {
  id: 'bigode-fininho',
  label: 'Bigode fininho',
  group: 'rosto',
  svg,
  aspect: H / W,
  anchor: (read) => overLip(read, 1.1, H / W, 0.5, 28 / H),
};
