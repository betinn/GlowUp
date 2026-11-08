/**
 * Turns the landmarks of a face into the shapes of the makeup tools: lips, brows, lids and where blush,
 * contour and freckles go. Plain arrays and no browser APIs, so every step can be tested. Like the other
 * regions, the shapes live in memory for the open photo and never reach the saved project.
 *
 * On a tilted or turned head the outlines of the model slip by a few pixels, and that shows on something
 * as small as a lip or a brow. So lips and brows are read from the color and the brightness of the photo
 * inside the outline, and go back to the outline when the photo cannot tell them from the skin.
 */

import { softBlur, type Area, type MaskTarget, type Point } from './mask';
import { FACE_OVAL, type Face, type FaceParts } from './scan';
import { addGlow, areaAround, buildOnSkin, closeSmallHoles, cover, eyeFrame, mid, place, skinLikeness, smooth, toGrid } from './skin';

/**
 * The inner contour of the lips left out over 20% of the teeth on 9 of 45 real smiles. Going this far
 * toward the outer contour brought that down to 5, and the photo pulls the edge back onto the teeth.
 */
const LIP_REACH = 0.4;
/** Gap between the lips, as a share of the mouth width. Below the first the mouth is closed. */
const CLOSED_MOUTH = 0.05;
const OPEN_MOUTH = 0.12;

/** The lips may reach this far past the outer contour, as a share of the mouth width. */
const LIP_ROOM = 0.06;
/** Skin is sampled in this band around the outer contour, as shares of the mouth width. */
const SKIN_FROM = 0.1;
const SKIN_TO = 0.24;
/** Softness of the lips, as a share of the mouth width. */
const LIP_FEATHER = 0.012;
/** Below this gap in chroma between the lips and the skin, the photo cannot tell them apart. */
const LIP_MIN_CONTRAST = 0.012;
/** Position of a pixel on the way from the color of the skin to the color of the lips. */
const LIP_FROM = 0.35;
const LIP_TO = 0.65;
/** Much darker than the lips is the inside of the mouth, as a share of the luma of the lips. */
const MOUTH_DARK_LOW = 0.35;
const MOUTH_DARK_HIGH = 0.55;
/** Glints and the line between closed lips are closed up to about this size, as a share of the mouth width. */
const LIP_CLOSE = 0.045;
const MIN_LIP_SAMPLES = 30;
/** Above this a pixel counts as lip, to tell what touches the lips. Above the second it closes a glint in. */
const LIP_SOLID = 0.4;
const LIP_FULL = 0.85;
/** How much less sure of the color a pixel inside the outer contour needs to be. */
const LIP_EASE = 0.2;

/** How far the brush may go around a brow, across and past its outer end, as shares of the thickness. */
const BROW_ROOM = 0.45;
const BROW_END_ROOM = 0.3;
/** The light around a brow is measured over this size, as a share of the thickness. */
const BROW_LIGHT = 1.5;
/** Below this share of darkness against the skin around it, the photo cannot tell the brow apart. */
const BROW_MIN_CONTRAST = 0.08;
/** The hair is what reaches between these shares of the darkness of the brow. */
const BROW_FROM = 0.3;
const BROW_TO = 0.7;
const BROW_CORE = 0.8;
/** Gaps between the hairs are filled softly, up to this strength, up to this share of the thickness away. */
const BROW_GAP = 0.6;
const BROW_GAP_REACH = 0.3;
const BROW_FEATHER = 0.08;
/** The eye keeps this room against the brush of a brow. */
const BROW_EYE_ROOM = 1.3;

/** The lid goes up to this share of the way from the lashes to the brow. The shadow stops a little sooner. */
const LID_REACH = 0.85;
const SHADOW_REACH = 0.72;
/** Height of the lid as a share of the eye width, when the brow is not known. */
const LID_NO_BROW = 0.45;
/** Near the nose the lid narrows, from this far along the eye to this share of its height. */
const LID_TAPER_FROM = 0.72;
const LID_TAPER_TO = 0.4;
/** The point past the outer corner, along the eye and up, as shares of the eye width. */
const WING_OUT = 0.22;
const WING_UP = 0.1;
const LID_FEATHER = 0.03;
const SHADOW_FEATHER = 0.07;
/** Steps of the shadow: strength and height. Strongest at the lashes, as a blended shadow is. */
const SHADOW_STEPS: readonly (readonly [number, number])[] = [
  [0.4, 0.34],
  [0.3, 0.67],
  [0.3, 1],
];
/** The eye opening stays out of the lid with this room. */
const LID_EYE_ROOM = 1.04;

/** Sizes along the eye width of the same side of the face, which shrinks as the head turns. */
const CHEEK_RADIUS = 0.42;
const CHEEK_PEAK = 0.9;
/** The blush goes this share of the way from the apple to the last point of its line, toward the temple. */
const CHEEK_SWEEP = 0.55;
const HOLLOW_RADIUS = 0.34;
const HOLLOW_PEAK = 0.9;
const SIDE_RADIUS = 0.3;
const SIDE_PEAK = 0.7;
const SIDE_INSET = 0.05;
const NOSE_RADIUS = 0.13;
const NOSE_PEAK = 0.6;
const TOP_RADIUS = 0.36;
const BRIDGE_RADIUS = 0.3;
/** Points of the outline along each side of the face, from the temple to the jaw. */
const SIDES: readonly (readonly number[])[] = [
  [127, 234, 93, 132, 58, 172],
  [356, 454, 323, 361, 288, 397],
];

/** How far the inner contour moves toward the outer one. Zero on a closed mouth: it has no teeth to show. */
export function lipReach(innerLips: readonly Point[]): number {
  const width = Math.hypot(innerLips[0][0] - innerLips[10][0], innerLips[0][1] - innerLips[10][1]);
  const gap = Math.hypot(innerLips[5][0] - innerLips[15][0], innerLips[5][1] - innerLips[15][1]) / Math.max(width, 1e-6);
  if (gap < CLOSED_MOUTH) return 0;
  return LIP_REACH * Math.min(1, (gap - CLOSED_MOUTH) / (OPEN_MOUTH - CLOSED_MOUTH));
}

const median = (list: number[]) => list.sort((a, b) => a - b)[list.length >> 1];

/** The pixels where `open` holds that can be reached from `seeds` without leaving it, going up, down and sideways. */
export function reached(open: (i: number) => boolean, seeds: readonly number[], w: number, h: number): Uint8Array {
  const seen = new Uint8Array(w * h);
  const stack = seeds.filter(open);
  for (const i of stack) seen[i] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    const neighbors = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w];
    for (const j of neighbors) {
      if (j < 0 || j >= seen.length || seen[j] || !open(j)) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  return seen;
}

/** Pushes each point of a shape away from its center by `by`, the same on every side. */
function outgrow(points: readonly Point[], by: number): Point[] {
  const cx = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  return points.map(([x, y]): Point => {
    const d = Math.hypot(x - cx, y - cy) || 1;
    return [x + ((x - cx) / d) * by, y + ((y - cy) / d) * by];
  });
}

/**
 * The lips as the photo shows them, over `area`: what stands on the way from the color of the skin around
 * the mouth to the color of the middle of the lips. Color without brightness, so a shadow does not move
 * the edge and a glint closes back. Teeth are far from that color, and what is much darker is the inside
 * of the mouth. Null when the lips and the skin look the same, as with a lipstick the color of the skin.
 */
export function lipsFromPhoto(
  rgba: Uint8ClampedArray,
  area: Area,
  outer: readonly Point[],
  inner: readonly Point[],
  open: boolean,
  width: number,
): Float32Array | null {
  const body = cover(outer, area);
  const hole = open ? cover(inner, area) : new Float32Array(body.length);
  const n = body.length;
  const ring = new Float32Array(n);
  for (let i = 0; i < n; i++) ring[i] = body[i] * (1 - hole[i]);
  const core = softBlur(ring, area.w, area.h, Math.max(0.6, width * LIP_FEATHER));
  const near = cover(outgrow(outer, width * SKIN_FROM), area);
  const far = cover(outgrow(outer, width * SKIN_TO), area);
  const r = new Float32Array(n);
  const g = new Float32Array(n);
  const y = new Float32Array(n);
  const lipR: number[] = [];
  const lipG: number[] = [];
  const lipY: number[] = [];
  const skinR: number[] = [];
  const skinG: number[] = [];
  for (let i = 0; i < n; i++) {
    const R = rgba[i * 4];
    const G = rgba[i * 4 + 1];
    const B = rgba[i * 4 + 2];
    const sum = R + G + B + 1e-3;
    r[i] = R / sum;
    g[i] = G / sum;
    y[i] = (0.2126 * R + 0.7152 * G + 0.0722 * B) / 255;
    if (core[i] > 0.9) {
      lipR.push(r[i]);
      lipG.push(g[i]);
      lipY.push(y[i]);
    } else if (far[i] > 0.5 && near[i] < 0.5) {
      skinR.push(r[i]);
      skinG.push(g[i]);
    }
  }
  if (lipR.length < MIN_LIP_SAMPLES || skinR.length < MIN_LIP_SAMPLES) return null;
  const sr = median(skinR);
  const sg = median(skinG);
  const dx = median(lipR) - sr;
  const dy = median(lipG) - sg;
  const gap = Math.hypot(dx, dy);
  if (gap < LIP_MIN_CONTRAST) return null;
  const my = Math.max(median(lipY), 0.05);
  const like = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const along = ((r[i] - sr) * dx + (g[i] - sg) * dy) / (gap * gap);
    // Inside the outline a lip washed out by the light still counts. Past it, the photo has to be sure.
    const ease = body[i] * LIP_EASE;
    like[i] = smooth(LIP_FROM - ease, LIP_TO - ease, along) * smooth(MOUTH_DARK_LOW, MOUTH_DARK_HIGH, y[i] / my) * (1 - hole[i]);
  }
  const soft = softBlur(like, area.w, area.h, Math.max(0.5, width * LIP_FEATHER * 0.5));
  const closed = closeSmallHoles(soft, area.w, area.h, width * LIP_CLOSE);
  const reach = softBlur(cover(outgrow(outer, width * LIP_ROOM), area), area.w, area.h, Math.max(0.5, width * LIP_FEATHER * 0.5));
  for (let i = 0; i < n; i++) closed[i] *= reach[i] * (1 - hole[i]);
  // A patch of redder skin near the mouth does not touch the lips, and a glint on them touches nothing else.
  const seeds: number[] = [];
  const edge: number[] = [];
  for (let i = 0; i < n; i++) {
    if (core[i] > 0.9) seeds.push(i);
    const x = i % area.w;
    if (hole[i] > 0.5 || x === 0 || x === area.w - 1 || i < area.w || i >= n - area.w) edge.push(i);
  }
  const outside = reached((i) => closed[i] <= LIP_FULL, edge, area.w, area.h);
  for (let i = 0; i < n; i++) if (!outside[i]) closed[i] = 1;
  const joined = reached((i) => closed[i] > LIP_SOLID, seeds, area.w, area.h);
  const kept = softBlur(Float32Array.from(joined), area.w, area.h, Math.max(0.6, width * LIP_FEATHER * 1.5));
  for (let i = 0; i < n; i++) closed[i] *= smooth(0.02, 0.2, kept[i]);
  return closed;
}

/** The lips of every face, without the inside of the mouth, as a mask from 0 to 255. Null when no mouth was found. */
export function buildLipMask(faces: readonly Face[], target: MaskTarget): Uint8Array | null {
  const out = new Uint8Array(target.w * target.h);
  for (const { parts } of faces) {
    if (parts.outerLips.length < 16 || parts.innerLips.length < 16) continue;
    const outer = toGrid(parts.outerLips, target);
    const inner = toGrid(parts.innerLips, target);
    const width = Math.hypot(outer[0][0] - outer[10][0], outer[0][1] - outer[10][1]) || 1;
    const area = areaAround(outer, width * (SKIN_TO + 0.05) + 2, target);
    if (area.w < 2 || area.h < 2) continue;
    const reach = lipReach(inner);
    const rgba = target.color?.(area);
    const found = rgba ? lipsFromPhoto(rgba, area, outer, inner, reach > 0, width) : null;
    if (found) {
      place(out, target, area, found);
      continue;
    }
    // The opening of the teeth tool, so the two tools meet without a gap.
    const opening = inner.map(([x, y], i): Point => [x + (outer[i][0] - x) * reach, y + (outer[i][1] - y) * reach]);
    const body = cover(outer, area);
    const hole = reach > 0 ? cover(opening, area) : new Float32Array(body.length);
    for (let i = 0; i < body.length; i++) body[i] *= 1 - hole[i];
    place(out, target, area, softBlur(body, area.w, area.h, Math.max(0.5, width * LIP_FEATHER)));
  }
  return out.some((v) => v > 0) ? out : null;
}

/** Top and bottom of a brow, paired from the outer end to the inner one. See `BROWS` for the order. */
function browPairs(brow: readonly Point[]): [Point, Point][] {
  const half = brow.length >> 1;
  return Array.from({ length: half }, (_, i): [Point, Point] => [brow[i], brow[brow.length - 1 - i]]);
}

const browThickness = (pairs: readonly [Point, Point][]) =>
  pairs.reduce((sum, [a, b]) => sum + Math.hypot(a[0] - b[0], a[1] - b[1]), 0) / pairs.length || 1;

/** The outline of a brow with room around it, the same on every point and more past the outer end. */
function browBand(pairs: readonly [Point, Point][], thickness: number): Point[] {
  const midOf = ([a, b]: [Point, Point]) => mid(a, b);
  const first = midOf(pairs[0]);
  const second = midOf(pairs[1]);
  const length = Math.hypot(first[0] - second[0], first[1] - second[1]) || 1;
  const end: Point = [((first[0] - second[0]) / length) * thickness * BROW_END_ROOM, ((first[1] - second[1]) / length) * thickness * BROW_END_ROOM];
  const push = (p: Point, from: Point, i: number): Point => {
    const d = Math.hypot(p[0] - from[0], p[1] - from[1]) || 1;
    const by = thickness * BROW_ROOM;
    const shift = i === 0 ? end : ([0, 0] as Point);
    return [p[0] + ((p[0] - from[0]) / d) * by + shift[0], p[1] + ((p[1] - from[1]) / d) * by + shift[1]];
  };
  const top = pairs.map(([a, b], i) => push(a, b, i));
  const bottom = pairs.map(([a, b], i) => push(b, a, i));
  return [...top, ...bottom.reverse()];
}

/**
 * The hair of a brow as the photo shows it, over `area`: what is darker than the skin right around it, so
 * a shine on the forehead or a shadow on the temple do not move it. The gaps between the hairs are filled
 * softly, since filling them is what the makeup is for. Null when the photo shows no darker brow.
 */
export function browFromPhoto(luma: Float32Array, area: Area, shape: Float32Array, band: Float32Array, thickness: number): Float32Array | null {
  const light = softBlur(luma, area.w, area.h, Math.max(1, thickness * BROW_LIGHT));
  const dark = new Float32Array(luma.length);
  const inside: number[] = [];
  for (let i = 0; i < luma.length; i++) {
    dark[i] = (light[i] - luma[i]) / Math.max(light[i], 0.05);
    if (shape[i] > 0.5) inside.push(dark[i]);
  }
  if (inside.length < 12) return null;
  const top = inside.sort((a, b) => a - b)[Math.floor(inside.length * BROW_CORE)];
  if (top < BROW_MIN_CONTRAST) return null;
  const hair = new Float32Array(luma.length);
  for (let i = 0; i < hair.length; i++) hair[i] = smooth(top * BROW_FROM, top * BROW_TO, dark[i]) * band[i];
  const near = softBlur(hair, area.w, area.h, Math.max(0.6, thickness * BROW_GAP_REACH));
  const out = new Float32Array(hair.length);
  for (let i = 0; i < hair.length; i++) out[i] = Math.max(hair[i], smooth(0.15, 0.5, near[i]) * BROW_GAP * band[i]);
  return softBlur(out, area.w, area.h, Math.max(0.5, thickness * BROW_FEATHER));
}

/**
 * The brows of every face, as a mask from 0 to 255. `hair` asks for the hair and its gaps, for the
 * automatic mode. Otherwise it is where the brush may go: the brow with room, to thicken or lengthen it.
 * Null when no brow was found.
 */
export function buildBrowMask(faces: readonly Face[], target: MaskTarget, hair: boolean): Uint8Array | null {
  const out = new Uint8Array(target.w * target.h);
  for (const { parts } of faces) {
    for (const [side, brow] of (parts.brows ?? []).entries()) {
      if (brow.length < 6) continue;
      const grid = toGrid(brow, target);
      const pairs = browPairs(grid);
      const thickness = browThickness(pairs);
      const outline = browBand(pairs, thickness);
      const area = areaAround(outline, thickness * BROW_LIGHT * 3 + 2, target);
      if (area.w < 2 || area.h < 2) continue;
      const sigma = Math.max(0.5, thickness * BROW_FEATHER);
      const shape = cover(grid, area);
      const band = softBlur(cover(outline, area), area.w, area.h, sigma);
      const luma = target.luma?.(area);
      const found = luma ? browFromPhoto(luma, area, shape, band, thickness) : null;
      const result = new Float32Array(shape.length);
      if (hair) result.set(found ?? softBlur(shape, area.w, area.h, sigma));
      else for (let i = 0; i < result.length; i++) result[i] = Math.max(band[i], found?.[i] ?? 0);
      // Lashes are as dark as a brow, and a low brow almost touches them.
      const eye = parts.eyes[side];
      if (eye?.length) {
        const opening = cover(growAround(toGrid(eye, target), BROW_EYE_ROOM), area);
        for (let i = 0; i < result.length; i++) result[i] *= 1 - opening[i];
      }
      place(out, target, area, result);
    }
  }
  return out.some((v) => v > 0) ? out : null;
}

function growAround(points: readonly Point[], factor: number): Point[] {
  const cx = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  return points.map(([x, y]): Point => [cx + (x - cx) * factor, cy + (y - cy) * factor]);
}

/**
 * The lid of one eye, on the grid: from the upper lashes up to `reach` of the way to the brow, narrowing
 * near the nose, with a point past the outer corner, as a shadow is usually drawn.
 */
export function lidShape(eye: readonly Point[], brow: readonly Point[] | undefined, reach: number): Point[] {
  const { width, down } = eyeFrame(eye);
  const up: Point = [-down[0], -down[1]];
  // From the outer corner along the upper lid to the inner corner.
  const lash = [eye[0], ...eye.slice(9).reverse(), eye[8]];
  const bottom = brow && brow.length >= 6 ? browPairs(brow).map(([, b]) => b) : null;
  const heightAt = (p: Point, t: number) => {
    if (!bottom) return width * LID_NO_BROW;
    const at = t * (bottom.length - 1);
    const i = Math.min(bottom.length - 2, Math.floor(at));
    const b = mid(bottom[i], bottom[i + 1], at - i);
    const h = (b[0] - p[0]) * up[0] + (b[1] - p[1]) * up[1];
    return h > width * 0.1 ? h : width * LID_NO_BROW;
  };
  const raised = lash.map((p, i): Point => {
    const t = i / (lash.length - 1);
    const taper = 1 - (1 - LID_TAPER_TO) * smooth(LID_TAPER_FROM, 1, t);
    const h = heightAt(p, t) * reach * taper;
    return [p[0] + up[0] * h, p[1] + up[1] * h];
  });
  const outer = eye[0];
  const inner = eye[8];
  const out: Point = [(outer[0] - inner[0]) / width, (outer[1] - inner[1]) / width];
  const wing: Point = [outer[0] + out[0] * width * WING_OUT + up[0] * width * WING_UP, outer[1] + out[1] * width * WING_OUT + up[1] * width * WING_UP];
  return [...lash, ...raised.reverse(), wing];
}

/**
 * The lids of every face, as a mask from 0 to 255. `faded` asks for the shadow of the automatic mode,
 * strongest at the lashes. Otherwise it is where the brush may go, the same all over. The color of the lid
 * leaves out what is not skin, for when the eye of the model slips: the white, the iris, the lashes and
 * the brow. Null when no eye was found.
 */
export function buildLidMask(faces: readonly Face[], target: MaskTarget, faded: boolean): Uint8Array | null {
  const out = new Uint8Array(target.w * target.h);
  for (const { parts } of faces) {
    for (const [side, eye] of parts.eyes.entries()) {
      if (eye.length < 16) continue;
      const grid = toGrid(eye, target);
      const brow = parts.brows?.[side] ? toGrid(parts.brows[side], target) : undefined;
      const { width } = eyeFrame(grid);
      const whole = lidShape(grid, brow, LID_REACH);
      const sigma = width * (faded ? SHADOW_FEATHER : LID_FEATHER);
      const area = areaAround(whole, sigma * 3 + 2, target);
      if (area.w < 2 || area.h < 2) continue;
      const opening = softBlur(cover(growAround(grid, LID_EYE_ROOM), area), area.w, area.h, Math.max(0.5, width * LID_FEATHER * 0.5));
      let shape: Float32Array = new Float32Array(area.w * area.h);
      if (faded) {
        for (const [strength, height] of SHADOW_STEPS) {
          const step = cover(lidShape(grid, brow, SHADOW_REACH * height), area);
          for (let i = 0; i < shape.length; i++) shape[i] += step[i] * strength;
        }
      } else {
        shape = cover(whole, area);
      }
      shape = softBlur(shape, area.w, area.h, sigma);
      const rgba = target.color?.(area);
      if (rgba) {
        const sure = cover(whole, area);
        for (let i = 0; i < sure.length; i++) sure[i] *= 1 - opening[i];
        const like = skinLikeness(rgba, sure);
        if (like) {
          const soft = softBlur(like, area.w, area.h, Math.max(0.5, width * LID_FEATHER * 0.5));
          for (let i = 0; i < shape.length; i++) shape[i] *= soft[i];
        }
      }
      for (let i = 0; i < shape.length; i++) shape[i] *= 1 - opening[i];
      place(out, target, area, shape);
    }
  }
  return out.some((v) => v > 0) ? out : null;
}

/** A soft band along a line on the grid: strongest on the line, gone about two radii away. */
export function addBand(shape: Float32Array, area: Area, line: readonly Point[], radius: number, peak: number): void {
  for (let s = 0; s + 1 < line.length; s++) {
    const a = line[s];
    const b = line[s + 1];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    // Beads close enough to read as one line.
    const beads = Math.max(1, Math.ceil(length / (radius * 0.4)));
    for (let k = 0; k <= beads; k++) addGlow(shape, area, mid(a, b, k / beads), radius, radius, [1, 0], peak);
  }
}

/** The eye width on each side of a face. A turned head shrinks one side, and the makeup there with it. */
function eyeWidths(parts: FaceParts, target: MaskTarget): number[] {
  const list = parts.eyes.filter((e) => e.length >= 16).map((e) => eyeFrame(toGrid(e, target)).width);
  const mean = list.reduce((sum, v) => sum + v, 0) / (list.length || 1);
  return [list[0] ?? mean, list[1] ?? mean];
}

function bandsOf(lines: readonly (readonly Point[])[] | undefined, target: MaskTarget, parts: FaceParts, shape: Float32Array, area: Area, radius: number, peak: number) {
  const widths = eyeWidths(parts, target);
  (lines ?? []).forEach((line, side) => {
    if (line.length >= 2) addBand(shape, area, toGrid(line, target), widths[side] * radius, peak);
  });
}

/** The apples of the cheeks of every face, going up toward the temples, on its skin. Null when no face shows them. */
export function buildCheekMask(faces: readonly Face[], target: MaskTarget): Uint8Array | null {
  return buildOnSkin(faces, target, ({ parts }, shape, area) => {
    const lines = parts.cheeks?.map((line) => line.map((p, i): Point => (i === line.length - 1 ? mid(line[i - 1], p, CHEEK_SWEEP) : p)));
    bandsOf(lines, target, parts, shape, area, CHEEK_RADIUS, CHEEK_PEAK);
  });
}

/** Under the cheekbones and along the sides of the face and of the nose, on the skin. Null when no face shows them. */
export function buildSculptMask(faces: readonly Face[], target: MaskTarget): Uint8Array | null {
  return buildOnSkin(faces, target, (face, shape, area) => {
    const { parts } = face;
    bandsOf(parts.hollows, target, parts, shape, area, HOLLOW_RADIUS, HOLLOW_PEAK);
    bandsOf(parts.noseSides, target, parts, shape, area, NOSE_RADIUS, NOSE_PEAK);
    if (!parts.hollows?.length || face.outline.length !== FACE_OVAL.length) return;
    // The outline runs on the very edge of the face: the band goes a little inside it.
    const grid = toGrid(face.outline, target);
    const center = mid(grid[0], grid[Math.floor(grid.length / 2)]);
    const widths = eyeWidths(parts, target);
    SIDES.forEach((list, side) => {
      const line = list.map((index) => mid(grid[FACE_OVAL.indexOf(index)], center, SIDE_INSET));
      addBand(shape, area, line, widths[side] * SIDE_RADIUS, SIDE_PEAK);
    });
  });
}

/** Over the nose and the top of the cheeks, as sun freckles fall, on the skin. Null when no face shows them. */
export function buildSprinkleMask(faces: readonly Face[], target: MaskTarget): Uint8Array | null {
  return buildOnSkin(faces, target, ({ parts }, shape, area) => {
    bandsOf(parts.cheekTops, target, parts, shape, area, TOP_RADIUS, 1);
    if (!parts.cheekTops?.length || !parts.midline || parts.midline.length < 9) return;
    const line = toGrid(parts.midline, target);
    const widths = eyeWidths(parts, target);
    // The bridge of the nose joins the two cheeks, from the point between the eyes down to the tip.
    addBand(shape, area, [line[2], line[3], line[4], line[5]], ((widths[0] + widths[1]) / 2) * BRIDGE_RADIUS, 1);
  });
}
