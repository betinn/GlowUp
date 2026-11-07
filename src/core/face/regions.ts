/**
 * Turns the landmarks of the eyes and the mouth into a soft limit for the brush. Plain arrays and no
 * browser APIs, so every step can be tested. The result is only a shape, built for the open photo:
 * it lives in memory and never reaches the saved project.
 */

import { bounds, fillPolygon, guidedFilter, softBlur, type Area, type MaskTarget, type Point } from './mask';
import type { Face, FaceParts } from './scan';

export type FaceRegion = 'iris' | 'sclera' | 'teeth';

/** The contour of the eye runs on the lash line, so the iris gets a little room past it. */
const EYE_ROOM = 1.12;
const CIRCLE_SIDES = 24;
/** Softness of the edges, as a share of the radius of the iris and of the width of the mouth. */
const IRIS_FEATHER = 0.12;
const MOUTH_FEATHER = 0.012;
/**
 * The inner contour of the lips left out over 20% of the teeth on 9 of 45 real smiles. Going this far
 * toward the outer contour brought that down to 5, and the photo pulls the edge back onto the teeth.
 */
const LIP_REACH = 0.4;
/** Gap between the lips, as a share of the mouth width. Below the first the mouth is closed. */
const CLOSED_MOUTH = 0.05;
const OPEN_MOUTH = 0.12;
const REFINE_RADIUS = 0.03;
const REFINE_EPS = 0.0015;

const toGrid = (points: readonly Point[], { w, h }: MaskTarget) => points.map(([u, v]): Point => [u * w, v * h]);

const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function around(points: readonly Point[], factor: number): Point[] {
  const box = bounds(points);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return points.map(([x, y]): Point => [cx + (x - cx) * factor, cy + (y - cy) * factor]);
}

/** A circle through points on its edge. The photo may have any proportions, so this runs on the grid. */
function circleThrough(ring: readonly Point[]): { outline: Point[]; radius: number } {
  const x = ring.reduce((sum, p) => sum + p[0], 0) / ring.length;
  const y = ring.reduce((sum, p) => sum + p[1], 0) / ring.length;
  const radius = ring.reduce((sum, p) => sum + distance(p, [x, y]), 0) / ring.length;
  const outline = Array.from({ length: CIRCLE_SIDES }, (_, i): Point => {
    const angle = (i / CIRCLE_SIDES) * Math.PI * 2;
    return [x + Math.cos(angle) * radius, y + Math.sin(angle) * radius];
  });
  return { outline, radius };
}

/** Pixels around a shape, with room for the blur, cut by the edges of the grid. */
function areaAround(points: readonly Point[], room: number, { w, h }: MaskTarget): Area {
  const box = bounds(points);
  const x = Math.max(0, Math.floor(box.x - room));
  const y = Math.max(0, Math.floor(box.y - room));
  return { x, y, w: Math.min(w, Math.ceil(box.x + box.w + room)) - x, h: Math.min(h, Math.ceil(box.y + box.h + room)) - y };
}

function cover(points: readonly Point[], area: Area): Float32Array {
  return fillPolygon(
    points.map(([x, y]): Point => [x - area.x, y - area.y]),
    area.w,
    area.h,
  );
}

function place(out: Uint8Array, target: MaskTarget, area: Area, shape: Float32Array): void {
  for (let y = 0; y < area.h; y++) {
    for (let x = 0; x < area.w; x++) {
      const at = (y + area.y) * target.w + x + area.x;
      out[at] = Math.max(out[at], Math.round(Math.min(1, shape[y * area.w + x]) * 255));
    }
  }
}

function addEye(out: Uint8Array, target: MaskTarget, region: 'iris' | 'sclera', eye: readonly Point[], ring: readonly Point[]): void {
  const contour = toGrid(eye, target);
  const { outline, radius } = circleThrough(toGrid(ring, target));
  const sigma = radius * IRIS_FEATHER;
  const roomy = around(contour, EYE_ROOM);
  const area = areaAround([...roomy, ...outline], sigma * 3 + 2, target);
  if (area.w < 1 || area.h < 1) return;
  const disc = cover(outline, area);
  const opening = cover(region === 'iris' ? roomy : contour, area);
  const shape = new Float32Array(disc.length);
  for (let i = 0; i < shape.length; i++) shape[i] = opening[i] * (region === 'iris' ? disc[i] : 1 - disc[i]);
  place(out, target, area, softBlur(shape, area.w, area.h, sigma));
}

/** How far the inner contour moves toward the outer one. Zero on a closed mouth: it has no teeth to show. */
export function lipReach(innerLips: readonly Point[]): number {
  const width = distance(innerLips[0], innerLips[10]);
  const gap = distance(innerLips[5], innerLips[15]) / Math.max(width, 1e-6);
  if (gap < CLOSED_MOUTH) return 0;
  return LIP_REACH * Math.min(1, (gap - CLOSED_MOUTH) / (OPEN_MOUTH - CLOSED_MOUTH));
}

function addTeeth(out: Uint8Array, target: MaskTarget, { innerLips, outerLips }: FaceParts): void {
  if (innerLips.length === 0) return;
  const inner = toGrid(innerLips, target);
  const outer = toGrid(outerLips, target);
  const reach = lipReach(inner);
  if (reach === 0) return;
  const width = distance(inner[0], inner[10]);
  const sigma = width * MOUTH_FEATHER;
  const area = areaAround(outer, sigma * 3 + 2, target);
  if (area.w < 1 || area.h < 1) return;
  const opening = inner.map(([x, y], i): Point => [x + (outer[i][0] - x) * reach, y + (outer[i][1] - y) * reach]);
  let shape = softBlur(cover(opening, area), area.w, area.h, sigma);
  const guide = target.luma?.(area);
  if (guide) shape = guidedFilter(guide, shape, area.w, area.h, Math.max(1, Math.round(width * REFINE_RADIUS)), REFINE_EPS);
  const lips = cover(outer, area);
  for (let i = 0; i < shape.length; i++) shape[i] *= lips[i];
  place(out, target, area, shape);
}

/** Limit for one region over all the faces, as a mask from 0 to 255. Null when no face shows that region. */
export function buildRegionMask(faces: readonly Face[], region: FaceRegion, target: MaskTarget): Uint8Array | null {
  const out = new Uint8Array(target.w * target.h);
  for (const { parts } of faces) {
    if (region === 'teeth') addTeeth(out, target, parts);
    else parts.eyes.forEach((eye, i) => addEye(out, target, region, eye, parts.irises[i]));
  }
  return out.some((value) => value > 0) ? out : null;
}
