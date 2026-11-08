/**
 * Where the view goes when a tool for eyes, teeth or makeup is ready. Plain math, so the choice can be tested.
 */

import type { Box } from '../view';
import type { Point } from './mask';
import { lipReach } from './makeup';
import type { LandmarkRegion } from './regions';
import type { Face } from './scan';

/** Of the free area, the share the eyes or the mouth fill once the view arrives. */
export const FOCUS_FILL = 0.6;
/** Past this the photo shows its pixels and the person loses where they are. */
export const FOCUS_MAX_ZOOM = 8;
/** All faces stay in view while that costs less than this share of the zoom one face would get. */
const KEEP_ALL = 0.6;
/** Or while all of them still come this much closer than the whole photo. */
const WORTH_ZOOM = 1.6;

/** The points to frame on each face that shows the region, in image UV. Faces without it are left out. */
export function focusPoints(faces: readonly Face[], region: LandmarkRegion): Point[][] {
  const list: Point[][] = [];
  for (const { parts, outline } of faces) {
    if (region === 'skin' || region === 'glow' || region === 'cheeks' || region === 'sculpt' || region === 'sprinkle') {
      list.push([...outline]);
    } else if (region === 'lips') {
      if (parts.outerLips.length) list.push([...parts.outerLips]);
    } else if (region === 'brows' || region === 'browhair') {
      if (parts.brows?.length) list.push(parts.brows.flat());
    } else if (region === 'lids' || region === 'shadow') {
      // The eyes and the brows above them: the lid lies between the two.
      if (parts.eyes.length) list.push([...parts.eyes.flat(), ...(parts.brows ?? []).flat()]);
    } else if (region === 'undereye') {
      // The eyes and a little below them, where the dark circles are.
      if (parts.eyes.length) list.push([...parts.eyes.flat(), ...below(parts.eyes)]);
    } else if (region === 'teeth') {
      if (parts.innerLips.length && lipReach(parts.innerLips) > 0) list.push([...parts.outerLips]);
    } else if (parts.eyes.length) {
      list.push(parts.eyes.flat());
    }
  }
  return list;
}

/** Points under each eye, as deep as the area of the dark circles. Image UV is close enough to frame them. */
function below(eyes: readonly (readonly Point[])[]): Point[] {
  return eyes.map((eye) => {
    const width = Math.hypot(eye[8][0] - eye[0][0], eye[8][1] - eye[0][1]);
    return [eye[4][0], eye[4][1] + width * 0.6] as Point;
  });
}

export function boxOf(points: readonly Point[]): Box {
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const [x, y] of points) {
    box.x0 = Math.min(box.x0, x);
    box.y0 = Math.min(box.y0, y);
    box.x1 = Math.max(box.x1, x);
    box.y1 = Math.max(box.y1, y);
  }
  return box;
}

const size = (b: Box) => (b.x1 - b.x0) * (b.y1 - b.y0);

/**
 * Frames every face while they still come out large enough, as on a selfie with two people.
 * Otherwise the largest face wins: on a group photo all the eyes together would be the whole photo.
 */
export function pickFocus(boxes: readonly Box[], zoomOf: (box: Box) => number): Box | null {
  if (boxes.length === 0) return null;
  const largest = boxes.reduce((best, b) => (size(b) > size(best) ? b : best));
  const all = boxOf(boxes.flatMap((b): Point[] => [[b.x0, b.y0], [b.x1, b.y1]]));
  const zoom = zoomOf(all);
  return zoom >= WORTH_ZOOM || zoom >= zoomOf(largest) * KEEP_ALL ? all : largest;
}
