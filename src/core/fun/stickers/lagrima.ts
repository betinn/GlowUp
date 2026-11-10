/** Lágrima: one blue tear, drawn for the project. It hangs under the eye on the left of the photo. */

import type { StickerDef } from '../types';
import { along, lowerLidOf, pin, poseOf } from './spots';

const W = 60;
const H = 90;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <path d="M30 4C36 24 54 42 54 60C54 76 42 86 30 86C18 86 6 76 6 60C6 42 24 24 30 4Z" fill="#74c8ff" fill-opacity="0.92" stroke="#2f8fd8" stroke-width="3.5" stroke-linejoin="round"/>
  <ellipse cx="21" cy="58" rx="6" ry="11" transform="rotate(18 21 58)" fill="#fff" fill-opacity="0.75"/>
</svg>`;

export const lagrima: StickerDef = {
  id: 'lagrima',
  label: 'Lágrima',
  group: 'rosto',
  svg,
  aspect: H / W,
  anchor(read) {
    const lid = lowerLidOf(read);
    if (!lid) return null;
    const pose = poseOf(read);
    return pin(along(lid.at, pose, 0, lid.width * 0.12), pose, lid.width * 0.42, H / W, 0.5, 0);
  },
};
