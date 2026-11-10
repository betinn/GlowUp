/** Chapéu de festa: a striped cone with a pompom, drawn for the project. It sits on the top of the head. */

import type { StickerDef } from '../types';
import { onHead } from './spots';

const W = 170;
const H = 250;

const APEX: readonly [number, number] = [85, 40];
const BASE_Y = 222;
const HALF = 70;
const COLORS = ['#ff6f91', '#ffd447', '#46c8bd', '#7e6bf2'];

/** The two sides of the cone at height `y`. */
const sides = (y: number) => {
  const t = (y - APEX[1]) / (BASE_Y - APEX[1]);
  return [APEX[0] - HALF * t, APEX[0] + HALF * t] as const;
};

/** The cone in bands of color, from the tip down. */
function bands(): string {
  const cuts = [40, 78, 116, 154, 190, 222];
  let out = '';
  for (let i = 0; i + 1 < cuts.length; i++) {
    const [a0, a1] = sides(cuts[i]);
    const [b0, b1] = sides(cuts[i + 1]);
    out += `<path d="M${a0.toFixed(1)} ${cuts[i]}L${a1.toFixed(1)} ${cuts[i]}L${b1.toFixed(1)} ${cuts[i + 1]}L${b0.toFixed(1)} ${cuts[i + 1]}Z" fill="${COLORS[i % COLORS.length]}"/>`;
  }
  return out;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  ${bands()}
  <path d="M85 40L15 222L155 222Z" fill="none" stroke="#3b2a57" stroke-width="5" stroke-linejoin="round"/>
  <path d="M74 66L38 190" stroke="#fff" stroke-opacity="0.35" stroke-width="7" stroke-linecap="round"/>
  <path d="M8 222Q24 206 40 222Q56 206 72 222Q88 206 104 222Q120 206 136 222Q152 206 162 222L162 238Q85 248 8 238Z" fill="#fff" stroke="#3b2a57" stroke-width="4" stroke-linejoin="round"/>
  <circle cx="85" cy="28" r="24" fill="#ff4f6d" stroke="#3b2a57" stroke-width="4"/>
  <circle cx="77" cy="20" r="7" fill="#fff" fill-opacity="0.6"/>
</svg>`;

export const chapeuFesta: StickerDef = {
  id: 'chapeu-festa',
  label: 'Chapéu de festa',
  group: 'cabeca',
  svg,
  aspect: H / W,
  anchor: (read) => onHead(read, 0.48, H / W, 0.5, 238 / H, 0.08),
};
