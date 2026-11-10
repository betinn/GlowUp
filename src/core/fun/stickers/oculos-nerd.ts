/** Óculos nerd: thick black frames with tape on the bridge, drawn for the project. On the line of the eyes. */

import type { StickerDef } from '../types';
import { twice } from './shapes';
import { onEyes } from './spots';

const W = 300;
const H = 110;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <g stroke-linecap="round" stroke-linejoin="round">${twice(`
    <path d="M16 34L2 30" fill="none" stroke="#151515" stroke-width="10"/>
    <rect x="19" y="19" width="112" height="72" rx="17" fill="#e6f3ff" fill-opacity="0.16" stroke="#151515" stroke-width="13"/>
    <path d="M40 36Q48 30 60 30" fill="none" stroke="#fff" stroke-opacity="0.8" stroke-width="5"/>`, W)}
    <path d="M131 46L169 46" fill="none" stroke="#151515" stroke-width="12"/>
    <rect x="139" y="32" width="22" height="28" rx="3" fill="#f6f1e2" stroke="#cdbf9f" stroke-width="2"/>
    <path d="M144 36L144 56M150 36L150 56M156 36L156 56" stroke="#d9cdb0" stroke-width="1.5"/>
  </g>
</svg>`;

export const oculosNerd: StickerDef = {
  id: 'oculos-nerd',
  label: 'Óculos nerd',
  group: 'oculos',
  svg,
  aspect: H / W,
  anchor: (read) => onEyes(read, 150 / W, H / W, 55 / H),
};
