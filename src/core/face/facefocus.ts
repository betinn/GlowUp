/** Where the automatic Desfoque puts its focus: a circle around the faces that matter in the photo. */

import type { BlurSettings } from '../doc';
import { applyMat3, imageToOutput, outputSize, type Crop } from '../geometry';
import type { Face } from './scan';

/** Faces under this share of the area of the largest are in the background, and blur with it. */
const MAIN_FACE = 0.4;
/** The sharp circle reaches this far from the middle of the face, in face heights, to take in hair and chin. */
const HEAD_REACH = 0.8;
/** The middle of the head sits this far above the middle of the face, in face heights: the outline stops at the forehead, and the hair goes on. Measured on real photos, where hair reached up to 0.6 of a face above it. */
const HEAD_LIFT = 0.25;
/** Width of the transition, as a share of the radius. */
const FEATHER = 1;
const MIN_FEATHER = 0.08;
const MAX_FEATHER = 0.4;
/** The limits of the sliders of the panel. */
const MAX_FOCUS = 0.7;

/** Center, radius and transition of the focus, in the terms of `BlurSettings`. Null without faces. */
export function faceFocus(faces: readonly Face[], crop: Crop, width: number, height: number): Pick<BlurSettings, 'cx' | 'cy' | 'focus' | 'feather'> | null {
  if (!faces.length) return null;
  const size = (f: Face) => f.box.w * width * f.box.h * height;
  const largest = Math.max(...faces.map(size));
  const main = faces.filter((f) => size(f) >= largest * MAIN_FACE);
  const toOutput = imageToOutput(crop, width, height);
  const out = outputSize(crop);
  const long = Math.max(out.w, out.h);
  // In shares of the long side of the output, where a circle is round.
  const heads = main.map((f) => {
    const [s, t] = applyMat3(toOutput, f.box.x + f.box.w / 2, f.box.y + f.box.h / 2 - f.box.h * HEAD_LIFT);
    const faceHeight = Math.max(f.box.w * width, f.box.h * height) / long;
    return { x: (s * out.w) / long, y: (t * out.h) / long, r: faceHeight * HEAD_REACH };
  });
  const x0 = Math.min(...heads.map((c) => c.x - c.r));
  const x1 = Math.max(...heads.map((c) => c.x + c.r));
  const y0 = Math.min(...heads.map((c) => c.y - c.r));
  const y1 = Math.max(...heads.map((c) => c.y + c.r));
  const x = (x0 + x1) / 2;
  const y = (y0 + y1) / 2;
  const reach = Math.max(...heads.map((c) => Math.hypot(c.x - x, c.y - y) + c.r));
  const focus = Math.min(MAX_FOCUS, reach);
  return {
    cx: (x * long) / out.w,
    cy: (y * long) / out.h,
    focus,
    feather: Math.min(MAX_FEATHER, Math.max(MIN_FEATHER, focus * FEATHER)),
  };
}
