/**
 * Turns the landmarks of the eyes and the mouth into a soft limit for the brush. Plain arrays and no
 * browser APIs, so every step can be tested. The result is only a shape, built for the open photo:
 * it lives in memory and never reaches the saved project.
 */

import { bounds, fillPolygon, guidedFilter, softBlur, type Area, type MaskTarget, type Point } from './mask';
import type { Face, FaceParts } from './scan';
import { buildGlowMask, buildSkinMask, buildUnderEyeMask } from './skin';

/**
 * Parts of the face drawn from the landmarks. `glow` holds the spots of the highlighter, which is not a
 * limit but a shape the automatic mode fills with: see `skin.ts`.
 */
export type LandmarkRegion = 'iris' | 'sclera' | 'teeth' | 'skin' | 'undereye' | 'glow';

/** Hair comes from its own segmenter, not from the landmarks: see `hair.ts`. */
export type FaceRegion = LandmarkRegion | 'hair';

/** The contour of the eye runs on the lash line, so the iris gets a little room past it. */
const EYE_ROOM = 1.12;
/**
 * With the photo at hand, the iris is what is as dark as it inside a circle a little larger than the
 * one the model gives, and inside a contour with more room, since on a tilted head the contour of the
 * model can cut the iris. Skin and the white of the eye are brighter and stay out.
 */
const IRIS_REACH = 1.05;
const OPEN_ROOM = 1.35;
/** Where the iris and its surroundings are sampled, as shares of the radius. */
const IRIS_CORE = 0.7;
const AROUND_FROM = 1.2;
const AROUND_TO = 1.8;
/** Below this gap in luma between the surroundings and the iris, the photo cannot tell them apart. */
const MIN_CONTRAST = 0.06;
const SHARP_FEATHER = 0.05;
/**
 * Lashes and the shadow of the lid are as dark as the iris but redder, as skin is. Redness here is red
 * minus green over the sum of the channels; past the iris by the first step it starts to leave, past the
 * second it is gone. A brown iris is red too, and its reference moves with it.
 */
const REDDER_FROM = 0.055;
const REDDER_TO = 0.1;
/** Lashes and lids only reach the edge of the iris. A red pupil, in the middle, stays in. */
const REDDER_EDGE_FROM = 0.55;
const REDDER_EDGE_TO = 0.75;
/**
 * The circle of the model can sit off the iris when the eye looks aside. It is moved, by up to this
 * share of the radius, to where it holds the most iris and leaves the least around it.
 */
const SHIFT_REACH = 0.4;
const SHIFT_STEP = 0.05;
const SHIFT_RING = 1.3;
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

function smooth(lo: number, hi: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}

const median = (list: number[]) => list.sort((a, b) => a - b)[list.length >> 1];

/**
 * The iris as the photo shows it, over `area`: the pixels inside a slightly larger circle and a roomy
 * contour that are as dark as the middle of the iris, against the skin and white around it. Small bright
 * flecks in the iris are closed; the glint of light stays mostly out. Null when the photo cannot tell
 * the iris from its surroundings, as with dark skin and dark eyes, or when the area is too small.
 */
/** Where the disc of `radius` over `like` holds the most and leaves the least in a ring around it. */
function bestCenter(like: Float32Array, area: Area, center: Point, radius: number): Point {
  const score = ([cx, cy]: Point) => {
    let s = 0;
    const reach = radius * SHIFT_RING;
    const x0 = Math.max(0, Math.floor(cx - reach - area.x));
    const x1 = Math.min(area.w, Math.ceil(cx + reach - area.x));
    const y0 = Math.max(0, Math.floor(cy - reach - area.y));
    const y1 = Math.min(area.h, Math.ceil(cy + reach - area.y));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const d = Math.hypot(x + area.x + 0.5 - cx, y + area.y + 0.5 - cy) / radius;
        if (d < 1) s += like[y * area.w + x];
        else if (d < SHIFT_RING) s -= like[y * area.w + x];
      }
    }
    return s;
  };
  let best = center;
  let top = score(center);
  const steps = Math.round(SHIFT_REACH / SHIFT_STEP);
  for (let j = -steps; j <= steps; j++) {
    for (let i = -steps; i <= steps; i++) {
      if (Math.hypot(i, j) > steps) continue;
      const at: Point = [center[0] + i * SHIFT_STEP * radius, center[1] + j * SHIFT_STEP * radius];
      const s = score(at);
      if (s > top) {
        top = s;
        best = at;
      }
    }
  }
  return best;
}

export function irisFromPhoto(
  luma: Float32Array,
  rgba: Uint8ClampedArray | undefined,
  area: Area,
  given: Point,
  radius: number,
  contour: readonly Point[],
): Float32Array | null {
  let center = given;
  const opening = cover(around(contour, OPEN_ROOM), area);
  const inside: number[] = [];
  const outside: number[] = [];
  const dist = new Float32Array(luma.length);
  const red = new Float32Array(luma.length);
  for (let y = 0; y < area.h; y++) {
    for (let x = 0; x < area.w; x++) {
      const i = y * area.w + x;
      const d = Math.hypot(x + area.x + 0.5 - center[0], y + area.y + 0.5 - center[1]) / radius;
      dist[i] = d;
      if (rgba) red[i] = (rgba[i * 4] - rgba[i * 4 + 1]) / (rgba[i * 4] + rgba[i * 4 + 1] + rgba[i * 4 + 2] + 1);
      if (opening[i] < 0.5) continue;
      if (d < IRIS_CORE) inside.push(i);
      else if (d > AROUND_FROM && d < AROUND_TO) outside.push(luma[i]);
    }
  }
  if (inside.length < 12 || outside.length < 12) return null;
  const dark = median(inside.map((i) => luma[i]));
  const light = median(outside);
  if (light - dark < MIN_CONTRAST) return null;
  // The color of the iris, left of the pupil and of the glint, which are both gray.
  const body = inside.filter((i) => luma[i] > dark * 0.7 && luma[i] < (dark + light) / 2);
  const reference = rgba && body.length >= 8 ? median(body.map((i) => red[i])) : null;
  let like: Float32Array = new Float32Array(luma.length);
  for (let i = 0; i < like.length; i++) {
    like[i] = smooth(0.3, 0.6, (light - luma[i]) / (light - dark));
    if (reference !== null) {
      const edge = smooth(REDDER_EDGE_FROM, REDDER_EDGE_TO, dist[i]);
      like[i] *= 1 - edge * smooth(reference + REDDER_FROM, reference + REDDER_TO, red[i]);
    }
  }
  const held = new Float32Array(like.length);
  for (let i = 0; i < like.length; i++) held[i] = like[i] * opening[i];
  center = bestCenter(held, area, center, radius);
  for (let y = 0; y < area.h; y++) {
    for (let x = 0; x < area.w; x++) dist[y * area.w + x] = Math.hypot(x + area.x + 0.5 - center[0], y + area.y + 0.5 - center[1]) / radius;
  }
  const big = cover(
    Array.from({ length: CIRCLE_SIDES }, (_, i): Point => {
      const a = (i / CIRCLE_SIDES) * Math.PI * 2;
      return [center[0] + Math.cos(a) * radius * IRIS_REACH, center[1] + Math.sin(a) * radius * IRIS_REACH];
    }),
    area,
  );
  // Flecks and grain inside the iris come back: iris all around brings a pixel back.
  const near = softBlur(like, area.w, area.h, Math.max(0.6, radius * 0.12));
  for (let i = 0; i < like.length; i++) {
    if (dist[i] < 0.9) like[i] = Math.max(like[i], smooth(0.45, 0.75, near[i]));
  }
  like = softBlur(like, area.w, area.h, Math.max(0.5, radius * SHARP_FEATHER));
  for (let i = 0; i < like.length; i++) like[i] *= opening[i] * big[i];
  return like;
}

function addEye(out: Uint8Array, target: MaskTarget, region: 'iris' | 'sclera', eye: readonly Point[], ring: readonly Point[]): void {
  const contour = toGrid(eye, target);
  const { outline, radius } = circleThrough(toGrid(ring, target));
  const sigma = radius * IRIS_FEATHER;
  const roomy = around(contour, EYE_ROOM);
  const area = areaAround([...around(contour, OPEN_ROOM), ...outline], radius * (AROUND_TO - 1) + sigma * 3 + 2, target);
  if (area.w < 1 || area.h < 1) return;
  if (region === 'iris') {
    const luma = target.luma?.(area);
    const box = bounds(outline);
    const found = luma ? irisFromPhoto(luma, target.color?.(area), area, [box.x + box.w / 2, box.y + box.h / 2], radius, contour) : null;
    if (found) {
      place(out, target, area, found);
      return;
    }
  }
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
export function buildRegionMask(faces: readonly Face[], region: LandmarkRegion, target: MaskTarget): Uint8Array | null {
  if (region === 'skin') return buildSkinMask(faces, target);
  if (region === 'undereye') return buildUnderEyeMask(faces, target);
  if (region === 'glow') return buildGlowMask(faces, target);
  const out = new Uint8Array(target.w * target.h);
  for (const { parts } of faces) {
    if (region === 'teeth') addTeeth(out, target, parts);
    else parts.eyes.forEach((eye, i) => addEye(out, target, region, eye, parts.irises[i]));
  }
  return out.some((value) => value > 0) ? out : null;
}
