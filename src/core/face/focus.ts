/**
 * Where the view goes when a tool for eyes or teeth is ready. Plain math, so the choice can be tested.
 */

import type { Box } from '../view';
import type { Point } from './mask';
import { lipReach, type LandmarkRegion } from './regions';
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
  for (const { parts } of faces) {
    if (region === 'teeth') {
      if (parts.innerLips.length && lipReach(parts.innerLips) > 0) list.push([...parts.outerLips]);
    } else if (parts.eyes.length) {
      list.push(parts.eyes.flat());
    }
  }
  return list;
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
