/**
 * Turns the landmarks of a face into the shapes of the skin tools: the skin itself, the area under the
 * eyes and the spots where light falls. Plain arrays and no browser APIs, so every step can be tested.
 * Like the limits of eyes and teeth, the shapes live in memory for the open photo and never reach the
 * saved project.
 */

import { bounds, fadeAlong, fillPolygon, guidedFilter, softBlur, type Area, type MaskTarget, type Point } from './mask';
import { CHIN, FACE_OVAL, type Face, type FaceParts } from './scan';

/** Room around the face, as a share of its size: the neck below and a little past the outline. */
const MARGIN = 0.12;
const MARGIN_BELOW = 0.55;
/** The skin goes on fading down the neck this far, as the face mask of the filter does. */
const NECK_REACH = 0.35;
/**
 * The outline of the model stops short of the hairline. The top of it is raised this much, as a share
 * of the face size, and the color of the skin then stops it at the hair.
 */
const FOREHEAD = 0.1;
/** Eyes, brows and lips are cut out with this much room around their outline, across and up and down. */
const EYE_ROOM: Point = [1.15, 1.7];
const BROW_ROOM: Point = [1.08, 1.5];
const LIP_ROOM: Point = [1.06, 1.12];
/** Softness of the cut-outs and of the outline, as a share of the face size. */
const HOLE_FEATHER = 0.012;
const EDGE_FEATHER = 0.018;
/** Pixels this deep in the shape tell the color of the skin. */
const SURE_SKIN = 0.95;
const MIN_SURE = 200;
/** Spread of the skin color below which the measure stops shrinking, in normalized chroma and in luma. */
const CHROMA_FLOOR = 0.012;
/** A pixel this many spreads away from the skin color is not skin. Between the two the edge is soft. */
const CHROMA_NEAR = 2.2;
const CHROMA_FAR = 4;
/** Toward red, a pixel may go this many times farther and still be skin. */
const RED_EASE = 4.5;
/** Luma as a share of the skin luma. Below the first it is hair, a brow or a dark background. */
const DARK_LOW = 0.38;
const DARK_HIGH = 0.55;
/** The color weight is blurred this much before use, so pores and grain do not punch holes. */
const COLOR_BLUR = 0.006;
const REFINE_RADIUS = 0.02;
const REFINE_EPS = 0.002;
/** Holes in the skin narrower than about this, as a share of the face size, are closed. */
const CLOSE_RADIUS = 0.022;

/** The area under each eye starts this far below the lashes and goes this deep, as a share of the eye width. */
const UNDER_GAP = 0.1;
const UNDER_DEPTH = 0.48;
const UNDER_FEATHER = 0.11;

export const toGrid = (points: readonly Point[], { w, h }: MaskTarget) => points.map(([u, v]): Point => [u * w, v * h]);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function smooth(lo: number, hi: number, v: number): number {
  const t = clamp((v - lo) / (hi - lo), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Scales a shape around the center of its box, more across than up and down when asked. */
function around(points: readonly Point[], fx: number, fy = fx): Point[] {
  const box = bounds(points);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return points.map(([x, y]): Point => [cx + (x - cx) * fx, cy + (y - cy) * fy]);
}

export function cover(points: readonly Point[], area: Area): Float32Array {
  return fillPolygon(
    points.map(([x, y]): Point => [x - area.x, y - area.y]),
    area.w,
    area.h,
  );
}

/** Pixels around a shape, with room for the blur, cut by the edges of the grid. */
export function areaAround(points: readonly Point[], room: number, { w, h }: MaskTarget): Area {
  const box = bounds(points);
  const x = Math.max(0, Math.floor(box.x - room));
  const y = Math.max(0, Math.floor(box.y - room));
  return { x, y, w: Math.min(w, Math.ceil(box.x + box.w + room)) - x, h: Math.min(h, Math.ceil(box.y + box.h + room)) - y };
}

export function place(out: Uint8Array, target: MaskTarget, area: Area, shape: Float32Array): void {
  for (let y = 0; y < area.h; y++) {
    for (let x = 0; x < area.w; x++) {
      const at = (y + area.y) * target.w + x + area.x;
      out[at] = Math.max(out[at], Math.round(clamp(shape[y * area.w + x], 0, 1) * 255));
    }
  }
}

/** Size of a face on the grid. */
export function faceSpan(face: Face, target: MaskTarget): number {
  const box = bounds(toGrid(face.outline, target));
  return Math.max(box.w, box.h, 1);
}

/** Pixels around a face, with room for the neck, cut by the edges of the grid. */
export function skinArea(face: Face, target: MaskTarget): Area {
  const box = bounds(toGrid(face.outline, target));
  const size = Math.max(box.w, box.h, 1);
  const x = Math.max(0, Math.floor(box.x - size * MARGIN));
  const y = Math.max(0, Math.floor(box.y - size * MARGIN));
  const x1 = Math.min(target.w, Math.ceil(box.x + box.w + size * MARGIN));
  const y1 = Math.min(target.h, Math.ceil(box.y + box.h + size * MARGIN_BELOW));
  return { x, y, w: Math.max(0, x1 - x), h: Math.max(0, y1 - y) };
}

/** What sits on the face and is not skin: eyes, brows and lips, with some room. */
function holesOf(parts: FaceParts, target: MaskTarget, area: Area, sigma: number): Float32Array {
  const holes = new Float32Array(area.w * area.h);
  const add = (points: readonly Point[], fx: number, fy = fx) => {
    if (points.length < 3) return;
    const shape = cover(around(toGrid(points, target), fx, fy), area);
    for (let i = 0; i < holes.length; i++) holes[i] = Math.max(holes[i], shape[i]);
  };
  for (const eye of parts.eyes) add(eye, ...EYE_ROOM);
  for (const brow of parts.brows ?? []) add(brow, ...BROW_ROOM);
  add(parts.outerLips, ...LIP_ROOM);
  return softBlur(holes, area.w, area.h, sigma);
}

/**
 * How much each pixel looks like the skin of the face, from 0 to 1. The color of the skin comes from the
 * pixels deep inside `shape`. Chroma is brightness-free, so a shadow on the cheek stays skin, and a pixel
 * much darker than the skin, as hair over the forehead, does not.
 */
export function skinLikeness(rgba: Uint8ClampedArray, shape: Float32Array): Float32Array | null {
  const n = shape.length;
  const r = new Float32Array(n);
  const g = new Float32Array(n);
  const y = new Float32Array(n);
  const sureR: number[] = [];
  const sureG: number[] = [];
  const sureY: number[] = [];
  for (let i = 0; i < n; i++) {
    const R = rgba[i * 4];
    const G = rgba[i * 4 + 1];
    const B = rgba[i * 4 + 2];
    const sum = R + G + B + 1e-3;
    r[i] = R / sum;
    g[i] = G / sum;
    y[i] = (0.2126 * R + 0.7152 * G + 0.0722 * B) / 255;
    if (shape[i] >= SURE_SKIN) {
      sureR.push(r[i]);
      sureG.push(g[i]);
      sureY.push(y[i]);
    }
  }
  if (sureR.length < MIN_SURE) return null;
  const median = (list: number[]) => list.sort((a, b) => a - b)[list.length >> 1];
  const mr = median(sureR);
  const mg = median(sureG);
  const my = Math.max(median(sureY), 0.05);
  const spread = (list: number[], m: number) => Math.max(median(list.map((v) => Math.abs(v - m))) * 1.4826, CHROMA_FLOOR);
  const sr = spread(sureR, mr);
  const sg = spread(sureG, mg);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    // Redder than the skin is still skin, as a pimple, a red mark or a flush: it counts less.
    const dr = r[i] - mr;
    const dg = g[i] - mg;
    const d = Math.hypot((dr > 0 ? dr / RED_EASE : dr) / sr, (dg < 0 ? dg / RED_EASE : dg) / sg);
    out[i] = (1 - smooth(CHROMA_NEAR, CHROMA_FAR, d)) * smooth(DARK_LOW, DARK_HIGH, y[i] / my);
  }
  return out;
}

/** The skin of one face, over `area`, from 0 to 1. */
/** The outline with its top raised toward the hairline. Only the upper half moves, the most at the top. */
export function withForehead(grid: readonly Point[], size: number): Point[] {
  if (grid.length !== FACE_OVAL.length) return [...grid];
  const [topX, topY] = grid[0];
  const [chinX, chinY] = grid[CHIN];
  const length = Math.hypot(topX - chinX, topY - chinY) || 1;
  const up: Point = [(topX - chinX) / length, (topY - chinY) / length];
  return grid.map(([x, y]): Point => {
    const t = ((x - chinX) * up[0] + (y - chinY) * up[1]) / length;
    const lift = size * FOREHEAD * smooth(0.55, 1, t);
    return [x + up[0] * lift, y + up[1] * lift];
  });
}

/**
 * The skin found for one target. A tool asks for the skin twice when it opens, for the limit and for what
 * the automatic mode fills with, and finding it is the slow part. It goes away with the target.
 */
const foundSkin = new WeakMap<MaskTarget, Map<Face, Float32Array>>();

function faceSkin(face: Face, target: MaskTarget, area: Area): Float32Array {
  let known = foundSkin.get(target);
  if (!known) foundSkin.set(target, (known = new Map()));
  const held = known.get(face);
  if (held) return held;
  const skin = findFaceSkin(face, target, area);
  known.set(face, skin);
  return skin;
}

function findFaceSkin(face: Face, target: MaskTarget, area: Area): Float32Array {
  const size = faceSpan(face, target);
  const grid = withForehead(toGrid(face.outline, target), size);
  let shape = cover(grid, area);
  const [topX, topY] = grid[0];
  const [chinX, chinY] = grid[CHIN] ?? grid[Math.floor(grid.length / 2)];
  const length = Math.hypot(chinX - topX, chinY - topY) || 1;
  if (grid.length === FACE_OVAL.length) {
    shape = fadeAlong(shape, area.w, area.h, (chinX - topX) / length, (chinY - topY) / length, size * NECK_REACH);
  }
  shape = softBlur(shape, area.w, area.h, size * EDGE_FEATHER);
  const holes = holesOf(face.parts, target, area, size * HOLE_FEATHER);
  for (let i = 0; i < shape.length; i++) shape[i] *= 1 - holes[i];
  const rgba = target.color?.(area);
  if (rgba) {
    const like = skinLikeness(rgba, shape);
    if (like) {
      const soft = softBlur(like, area.w, area.h, Math.max(1, size * COLOR_BLUR));
      for (let i = 0; i < shape.length; i++) shape[i] *= soft[i];
    }
  }
  const guide = target.luma?.(area);
  if (guide) shape = guidedFilter(guide, shape, area.w, area.h, Math.max(1, Math.round(size * REFINE_RADIUS)), REFINE_EPS);
  shape = closeSmallHoles(shape, area.w, area.h, size * CLOSE_RADIUS);
  for (let i = 0; i < shape.length; i++) shape[i] *= 1 - holes[i];
  return shape;
}

/**
 * Fills the small holes a pimple, a mole or a shadow leaves in the skin, since the skin tools are for
 * them too. Skin all around a pixel brings it back; the outline of the face, with skin on one side
 * only, stays where it was, and so do the large holes of the eyes and the mouth.
 */
export function closeSmallHoles(shape: Float32Array, w: number, h: number, sigma: number): Float32Array {
  const around = softBlur(shape, w, h, Math.max(1, sigma));
  const out = new Float32Array(shape.length);
  for (let i = 0; i < shape.length; i++) out[i] = Math.max(shape[i], smooth(0.55, 0.85, around[i]));
  return out;
}

/** The skin of every face, as a mask from 0 to 255. Null when there is no face. */
export function buildSkinMask(faces: readonly Face[], target: MaskTarget): Uint8Array | null {
  const out = new Uint8Array(target.w * target.h);
  for (const face of faces) {
    const area = skinArea(face, target);
    if (area.w < 2 || area.h < 2) continue;
    place(out, target, area, faceSkin(face, target, area));
  }
  return out.some((v) => v > 0) ? out : null;
}

/** The two ends of an eye and the way down from it, on the grid. */
export function eyeFrame(eye: readonly Point[]) {
  // The contour goes from the outer corner along the lower lid to the inner corner, then back on top.
  const outer = eye[0];
  const inner = eye[8];
  const width = Math.hypot(inner[0] - outer[0], inner[1] - outer[1]) || 1;
  const ax = (inner[0] - outer[0]) / width;
  const ay = (inner[1] - outer[1]) / width;
  const lower = eye[4];
  const upper = eye[12];
  // Of the two normals to the eye line, the one that points from the upper lid to the lower one.
  const sign = (lower[0] - upper[0]) * -ay + (lower[1] - upper[1]) * ax >= 0 ? 1 : -1;
  return { width, down: [-ay * sign, ax * sign] as Point, lid: eye.slice(0, 9) };
}

/**
 * The crescent under one eye, on the grid. It starts a little below the lashes and is deepest toward the
 * inner corner, where dark circles are darkest.
 */
export function underEyeShape(eye: readonly Point[]): Point[] {
  const { width, down, lid } = eyeFrame(eye);
  const top: Point[] = [];
  const bottom: Point[] = [];
  lid.forEach(([x, y], i) => {
    const t = i / (lid.length - 1);
    const depth = UNDER_GAP + UNDER_DEPTH * Math.sin(Math.PI * clamp(0.08 + t * 0.84, 0, 1)) ** 0.8 * (0.8 + 0.2 * t);
    top.push([x + down[0] * width * UNDER_GAP, y + down[1] * width * UNDER_GAP]);
    bottom.push([x + down[0] * width * depth, y + down[1] * width * depth]);
  });
  return [...top, ...bottom.reverse()];
}

/** The area under the eyes of every face, as a mask from 0 to 255. Null when no eye was found. */
export function buildUnderEyeMask(faces: readonly Face[], target: MaskTarget): Uint8Array | null {
  const out = new Uint8Array(target.w * target.h);
  for (const { parts } of faces) {
    for (const eye of parts.eyes) {
      if (eye.length < 16) continue;
      const contour = toGrid(eye, target);
      const shape = underEyeShape(contour);
      const sigma = eyeFrame(contour).width * UNDER_FEATHER;
      const area = areaAround(shape, sigma * 3 + 2, target);
      if (area.w < 2 || area.h < 2) continue;
      place(out, target, area, softBlur(cover(shape, area), area.w, area.h, sigma));
    }
  }
  return out.some((v) => v > 0) ? out : null;
}

/** A soft ellipse added to `shape`, centered at (cx, cy) on the grid and turned along (ax, ay). */
export function addGlow(shape: Float32Array, area: Area, c: Point, rx: number, ry: number, axis: Point, peak: number): void {
  const reach = Math.max(rx, ry) * 2.2;
  const x0 = Math.max(0, Math.floor(c[0] - reach - area.x));
  const x1 = Math.min(area.w, Math.ceil(c[0] + reach - area.x));
  const y0 = Math.max(0, Math.floor(c[1] - reach - area.y));
  const y1 = Math.min(area.h, Math.ceil(c[1] + reach - area.y));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const dx = x + area.x + 0.5 - c[0];
      const dy = y + area.y + 0.5 - c[1];
      const along = (dx * axis[0] + dy * axis[1]) / rx;
      const across = (-dx * axis[1] + dy * axis[0]) / ry;
      const v = peak * Math.exp(-0.5 * (along * along + across * across) * 2.2);
      const i = y * area.w + x;
      if (v > shape[i]) shape[i] = v;
    }
  }
}

export const mid = (a: Point, b: Point, t = 0.5): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/**
 * Where a highlighter goes on one face, on the grid: the cheekbones, the bridge of the nose, the middle
 * of the forehead, the bow of the upper lip and the chin.
 */
function glowSpots(parts: FaceParts, target: MaskTarget, shape: Float32Array, area: Area): void {
  const eyes = parts.eyes.filter((e) => e.length >= 16).map((e) => eyeFrame(toGrid(e, target)));
  if (eyes.length === 0) return;
  const ew = eyes.reduce((s, e) => s + e.width, 0) / eyes.length;
  for (const eye of eyes) {
    const outer = eye.lid[0];
    const inner = eye.lid[8];
    const center = mid(outer, inner);
    const out: Point = [(outer[0] - inner[0]) / eye.width, (outer[1] - inner[1]) / eye.width];
    // On the cheekbone: below the eye and toward the temple, tilted up to the outer corner.
    const at: Point = [center[0] + eye.down[0] * ew * 0.95 + out[0] * ew * 0.3, center[1] + eye.down[1] * ew * 0.95 + out[1] * ew * 0.3];
    const tilt: Point = [out[0] * 0.9 - eye.down[0] * 0.44, out[1] * 0.9 - eye.down[1] * 0.44];
    const len = Math.hypot(tilt[0], tilt[1]) || 1;
    addGlow(shape, area, at, ew * 0.55, ew * 0.22, [tilt[0] / len, tilt[1] / len], 1);
  }
  const line = parts.midline ? toGrid(parts.midline, target) : null;
  if (line && line.length >= 9) {
    const [forehead, between, , , , , , tip, chin] = line;
    const bridge = mid(between, tip, 0.15);
    const end = mid(between, tip, 0.85);
    const length = Math.hypot(end[0] - bridge[0], end[1] - bridge[1]) || 1;
    const axis: Point = [(end[0] - bridge[0]) / length, (end[1] - bridge[1]) / length];
    addGlow(shape, area, mid(bridge, end), length * 0.55, ew * 0.11, axis, 0.9);
    addGlow(shape, area, mid(between, forehead, 0.75), ew * 0.42, ew * 0.26, [axis[1], -axis[0]], 0.75);
    const lips = toGrid(parts.outerLips, target);
    if (lips.length >= 16) {
      const bow = lips[15];
      const up: Point = [-axis[0], -axis[1]];
      addGlow(shape, area, [bow[0] + up[0] * ew * 0.12, bow[1] + up[1] * ew * 0.12], ew * 0.17, ew * 0.07, [axis[1], -axis[0]], 0.8);
      addGlow(shape, area, mid(lips[5], chin, 0.5), ew * 0.2, ew * 0.13, [axis[1], -axis[0]], 0.6);
    }
  }
}

/** The shape `paint` draws on each face, kept on its skin, as a mask from 0 to 255. Null when it draws nothing. */
export function buildOnSkin(
  faces: readonly Face[],
  target: MaskTarget,
  paint: (face: Face, shape: Float32Array, area: Area) => void,
): Uint8Array | null {
  const out = new Uint8Array(target.w * target.h);
  for (const face of faces) {
    const area = skinArea(face, target);
    if (area.w < 2 || area.h < 2) continue;
    const spots = new Float32Array(area.w * area.h);
    paint(face, spots, area);
    const skin = faceSkin(face, target, area);
    for (let i = 0; i < spots.length; i++) spots[i] *= smooth(0.15, 0.7, skin[i]);
    place(out, target, area, spots);
  }
  return out.some((v) => v > 0) ? out : null;
}

/** The spots of light of every face, kept on its skin, as a mask from 0 to 255. Null when there is no face. */
export function buildGlowMask(faces: readonly Face[], target: MaskTarget): Uint8Array | null {
  return buildOnSkin(faces, target, (face, shape, area) => glowSpots(face.parts, target, shape, area));
}

/** Points of the outline that sit on the ears when the head turns: the top of each ear, its middle and the lobe. */
const EAR_POINTS = [454, 323, 361, 234, 93, 132];
/**
 * Room left around each of those points, and around the nostrils, as a share of the eye width. Around
 * the ears only a band along the outline counts: the hollow of the ear falls on it, and the cheek just
 * inside is skin like any other.
 */
const EAR_ROOM = 0.42;
const EAR_BAND = 0.12;
const NOSTRIL_ROOM = 1.3;
const NOSTRIL_FEATHER = 0.08;

/** The smallest convex shape around some points, in order. */
function hull(points: readonly Point[]): Point[] {
  const list = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (list.length < 3) return list;
  const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (from: Point[]) => {
    const out: Point[] = [];
    for (const p of from) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(list), ...half([...list].reverse())];
}

/**
 * Where Manchas does not look for spots on one face, over `area`, from 0 to 1: the nostrils and the
 * hollow of the ears, which are round and dark like a spot and must stay. The outline of the face runs
 * over the ear when the head turns, so the ear can fall inside the skin.
 */
export function spotGuard(face: Face, target: MaskTarget, area: Area): Float32Array {
  const guard = new Float32Array(area.w * area.h);
  const { parts } = face;
  const eyes = parts.eyes.filter((e) => e.length >= 16).map((e) => eyeFrame(toGrid(e, target)));
  const lips = toGrid(parts.outerLips, target);
  if (eyes.length === 0 || lips.length < 16) return guard;
  const ew = eyes.reduce((s, e) => s + e.width, 0) / eyes.length;
  if (face.outline.length === FACE_OVAL.length) {
    const outline = toGrid(face.outline, target);
    const ears = new Float32Array(guard.length);
    for (const index of EAR_POINTS) addGlow(ears, area, outline[FACE_OVAL.indexOf(index)], ew * EAR_ROOM, ew * EAR_ROOM, [1, 0], 1);
    // Half on the outline, near 1 a few band widths inside it.
    const inside = softBlur(cover(outline, area), area.w, area.h, Math.max(1, ew * EAR_BAND));
    for (let i = 0; i < guard.length; i++) guard[i] = Math.max(guard[i], ears[i] * (1 - smooth(0.75, 0.95, inside[i])));
  }
  const nostrils = (parts.nostrils ?? []).filter((n) => n.length >= 3);
  if (nostrils.length) {
    const holes = new Float32Array(guard.length);
    for (const nostril of nostrils) {
      const shape = cover(around(hull(toGrid(nostril, target)), NOSTRIL_ROOM), area);
      for (let i = 0; i < holes.length; i++) holes[i] = Math.max(holes[i], shape[i]);
    }
    const soft = softBlur(holes, area.w, area.h, Math.max(1, ew * NOSTRIL_FEATHER));
    for (let i = 0; i < guard.length; i++) guard[i] = Math.max(guard[i], soft[i]);
  } else {
    // Faces made by hand have no nostrils: they are where they usually are, between the tip and the lips.
    const eyeLine = eyes.map((e) => mid(e.lid[0], e.lid[8]));
    const between = eyeLine.length === 2 ? mid(eyeLine[0], eyeLine[1]) : eyeLine[0];
    const line = parts.midline ? toGrid(parts.midline, target) : null;
    const tip = line && line.length >= 9 ? line[7] : mid(between, lips[15], 0.62);
    const length = Math.hypot(lips[15][0] - between[0], lips[15][1] - between[1]) || 1;
    const down: Point = [(lips[15][0] - between[0]) / length, (lips[15][1] - between[1]) / length];
    const nose = new Float32Array(guard.length);
    addGlow(nose, area, mid(tip, lips[15], 0.4), ew * 0.42, ew * 0.2, [down[1], -down[0]], 1);
    for (let i = 0; i < guard.length; i++) guard[i] = Math.max(guard[i], nose[i]);
  }
  for (let i = 0; i < guard.length; i++) guard[i] = Math.min(1, guard[i] * 2);
  return guard;
}
