/** Sardas: freckles over the nose and the tops of the cheeks, drawn for the project. */

import { eyesOf } from '../kit';
import type { StickerDef } from '../types';
import { scatter } from './shapes';
import { dist, mix, noseOf, pin, poseOf } from './spots';

const W = 260;
const H = 100;

/** Freckles in two patches, one under each eye, and a few across the bridge of the nose. */
function freckles(): string {
  const r = scatter(120, 7);
  const dots: string[] = [];
  const patch = (cx: number, cy: number, rx: number, ry: number, count: number, from: number) => {
    for (let i = 0; i < count; i++) {
      const a = r[from + i * 3] * Math.PI * 2;
      const k = Math.sqrt(r[from + i * 3 + 1]);
      const size = 2.2 + r[from + i * 3 + 2] * 2.6;
      const x = cx + Math.cos(a) * rx * k;
      const y = cy + Math.sin(a) * ry * k;
      dots.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${size.toFixed(1)}"/>`);
    }
  };
  patch(62, 52, 52, 30, 15, 0);
  patch(198, 52, 52, 30, 15, 45);
  patch(130, 40, 18, 12, 5, 90);
  return dots.join('');
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <g fill="#9a5a34" fill-opacity="0.55">${freckles()}</g>
</svg>`;

export const sardas: StickerDef = {
  id: 'sardas',
  label: 'Sardas',
  group: 'rosto',
  svg,
  aspect: H / W,
  anchor(read) {
    const eyes = eyesOf(read);
    const nose = noseOf(read);
    if (eyes.length < 2 || !nose) return null;
    const a = eyes[0].c;
    const b = eyes[eyes.length - 1].c;
    const between = mix(a, b, 0.5);
    return pin(mix(between, nose.tip, 0.55), poseOf(read), dist(a, b) * 1.7, H / W, 0.5, 0.45);
  },
};
