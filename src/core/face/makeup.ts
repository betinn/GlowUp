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
import { FACE_OVAL, MIDLINE, NOSE_SIDES, type Face, type FaceParts } from './scan';
import { addGlow, areaAround, buildOnSkin, cover, eyeFrame, mid, place, skinLikeness, smooth, toGrid } from './skin';

/**
 * The inner contour of the lips left out over 20% of the teeth on 9 of 45 real smiles. Going this far
 * toward the outer contour brought that down to 5, and the photo pulls the edge back onto the teeth.
 */
const LIP_REACH = 0.4;
/** Gap between the lips, as a share of the mouth width. Below the first the mouth is closed. */
const CLOSED_MOUTH = 0.05;
const OPEN_MOUTH = 0.12;

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
const MIN_LIP_SAMPLES = 30;
/** How far each point of the outer contour may move, out and in, as shares of the mouth width. */
const FIT_OUT = 0.05;
const FIT_IN = 0.05;
/** Length of each search step, the stretch read on each side of it and the blur of the map, the same way. */
const FIT_STEP = 0.005;
const FIT_SIDE = 0.025;
const FIT_BLUR = 0.008;
/** A step of the map below the first is no edge, and above the second it is sure. */
const FIT_WEAK = 0.08;
const FIT_CLEAR = 0.3;
/** To move out, a step must also be this much darker on its inner side, as a share of the outer one. */
const FIT_OUT_DARKER = 0.04;
/** What the farthest step loses against one on the contour. */
const FIT_FAR = 0.2;
/**
 * A step farther out than the strongest one takes its place when it is this share of it and this tall, with
 * this much of the color of the lips on its inner side and at most this much on its outer side.
 */
const FIT_OUTER_SHARE = 0.35;
const FIT_OUTER_STEP = 0.14;
const FIT_OUTER_IN = 0.2;
const FIT_OUTER_OUT = 0.4;
/** Luma as a share of the luma of the skin, where a glint starts and where it is sure. And its halo, on the mouth width. */
const GLINT_FROM = 0.98;
const GLINT_TO = 1.1;
const GLINT_HALO = 0.02;
/** New points per stretch of the contour of the model. */
const FIT_POINTS = 6;
/** Along the contour, in points: the window that drops a wrong step, and the softness of the offsets. */
const FIT_MEDIAN = 3;
const FIT_SMOOTH = 3;
/** Inside the mouth, this blur tells a wide opening from the narrow line between the lips. */
const MOUTH_DEEP = 0.02;
/** What is not lip may start in the opening this far past the contour, as a share of the mouth width. */
const MOUTH_ROOM = 0.04;
/** A pixel below the first starts what is not lip inside the mouth, and it spreads below the second. */
const MOUTH_SEED = 0.25;
const MOUTH_SOLID = 0.5;

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
const NOSE_RADIUS = 0.115;
const NOSE_PEAK = 0.6;
/**
 * How far from the middle of the bridge the lines of the nose stand, with the points of the mesh beside the
 * middle at 1. A little past them is the edge where the top of the nose turns into its side, which is where a
 * contour goes, and the top stays clear.
 */
const NOSE_OUT = 1.4;
const TOP_RADIUS = 0.36;
/** Around them a few strays, since the mask of the freckles says how likely a dot is, not how dark. */
const TOP_FRINGE = 0.72;
const FRINGE_PEAK = 0.3;
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

/** Pushes each point of a shape away from its center by `by`, the same on every side. */
function outgrow(points: readonly Point[], by: number): Point[] {
  const cx = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  return points.map(([x, y]): Point => {
    const d = Math.hypot(x - cx, y - cy) || 1;
    return [x + ((x - cx) / d) * by, y + ((y - cy) / d) * by];
  });
}

/** A closed curve through the points, with `steps` new points on each stretch. */
export function smoothLoop(points: readonly Point[], steps: number): Point[] {
  const n = points.length;
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [points[(i + n - 1) % n], points[i], points[(i + 1) % n], points[(i + 2) % n]];
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const blend = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
      out.push([blend(p0[0], p1[0], p2[0], p3[0]), blend(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}

/** The value of a map over `area` at a point on the grid, between pixels. */
export function sampleAt(map: Float32Array, area: Area, x: number, y: number): number {
  const fx = Math.min(area.w - 1.001, Math.max(0, x - area.x - 0.5));
  const fy = Math.min(area.h - 1.001, Math.max(0, y - area.y - 0.5));
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = fx - ix;
  const ty = fy - iy;
  const at = iy * area.w + ix;
  return (map[at] * (1 - tx) + map[at + 1] * tx) * (1 - ty) + (map[at + area.w] * (1 - tx) + map[at + area.w + 1] * tx) * ty;
}

/**
 * Moves a closed contour onto the edge of a map from 0 outside to 1 inside. Each point looks along its
 * normal for the strongest step, and a step far from the contour must be stronger to win. A clear step
 * farther out goes first, from a paler part of the lip to the skin, and with `bright` going out also takes
 * a darker inner side. A point with no clear step takes after
 * its neighbors, and the offsets are smoothed along the contour, so the result is a clean line that still
 * follows the bow of the lip and the corners of the mouth.
 */
export function fitContour(contour: readonly Point[], like: Float32Array, area: Area, width: number, bright?: Float32Array): Point[] {
  const n = contour.length;
  const cx = contour.reduce((sum, p) => sum + p[0], 0) / n;
  const cy = contour.reduce((sum, p) => sum + p[1], 0) / n;
  const normals = contour.map(([x, y], i): Point => {
    const a = contour[(i + n - 1) % n];
    const b = contour[(i + 1) % n];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = (b[1] - a[1]) / length;
    const ny = -(b[0] - a[0]) / length;
    return nx * (x - cx) + ny * (y - cy) >= 0 ? [nx, ny] : [-nx, -ny];
  });
  const step = Math.max(0.5, width * FIT_STEP);
  const reachOut = Math.ceil((width * FIT_OUT) / step);
  const reachIn = Math.ceil((width * FIT_IN) / step);
  const side = Math.max(1, Math.round((width * FIT_SIDE) / step));
  const offsets = new Float32Array(n);
  const trust = new Float32Array(n);
  contour.forEach(([x, y], i) => {
    const [nx, ny] = normals[i];
    const read = (k: number) => sampleAt(like, area, x + nx * k * step, y + ny * k * step);
    const steps: { k: number; score: number; inside: number; outside: number }[] = [];
    let top = -Infinity;
    let strongest = 0;
    for (let k = reachOut; k >= -reachIn; k--) {
      let inside = 0;
      let outside = 0;
      for (let j = 0; j < side; j++) {
        inside += read(k - j - 0.5);
        outside += read(k + j + 0.5);
      }
      const score = (inside - outside) / side;
      const fair = score - (FIT_FAR * Math.abs(k)) / Math.max(reachOut, reachIn);
      // Reddish skin around a mouth has a step of color with nothing under it. A lip is also darker.
      let allowed = true;
      if (k > 0 && bright) {
        const within = sampleAt(bright, area, x + nx * (k - side / 2) * step, y + ny * (k - side / 2) * step);
        const beyond = sampleAt(bright, area, x + nx * (k + side / 2) * step, y + ny * (k + side / 2) * step);
        allowed = beyond - within >= beyond * FIT_OUT_DARKER;
      }
      if (!allowed) continue;
      steps.push({ k, score, inside: inside / side, outside: outside / side });
      if (fair > top) {
        top = fair;
        strongest = steps.length - 1;
      }
    }
    // A lip can have a paler stretch by its edge, as at the top of the bow. A real step farther out wins.
    const best = steps[strongest];
    let chosen = best;
    for (let at = 1; at < strongest; at++) {
      const c = steps[at];
      if (steps[at - 1].k !== c.k + 1 || steps[at + 1].k !== c.k - 1) continue;
      if (c.score < steps[at - 1].score || c.score < steps[at + 1].score) continue;
      if (c.score < best.score * FIT_OUTER_SHARE || c.score < FIT_OUTER_STEP || c.inside < FIT_OUTER_IN || c.outside > FIT_OUTER_OUT) continue;
      chosen = c;
      break;
    }
    offsets[i] = chosen.k * step;
    trust[i] = smooth(FIT_WEAK, FIT_CLEAR, chosen.score);
  });
  // A wrong step on one point drops out against the points around it.
  const steady = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const near = Array.from({ length: FIT_MEDIAN * 2 + 1 }, (_, j) => offsets[(i + j - FIT_MEDIAN + n) % n]);
    steady[i] = median(near);
  }
  return contour.map(([x, y], i): Point => {
    let sum = 0;
    let weight = 0;
    for (let j = -FIT_SMOOTH * 3; j <= FIT_SMOOTH * 3; j++) {
      const at = (i + j + n) % n;
      const w = Math.exp((-0.5 * j * j) / (FIT_SMOOTH * FIT_SMOOTH)) * (trust[at] + 1e-3);
      sum += steady[at] * w;
      weight += w;
    }
    const by = sum / weight;
    return [x + normals[i][0] * by, y + normals[i][1] * by];
  });
}

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

/**
 * The lips as the photo shows them, over `area`. The color of the lips against the skin around the mouth
 * gives a map, in color without brightness, so a shadow does not move the edge, and the outer contour of
 * the model is fitted to it. A contour, not pixels: the edge comes out clean under a strong color, and a
 * glint or a pale part stays in. Inside the mouth only what is not the color of the lips and touches the
 * opening stays out, as teeth and the dark, so the line where the lips meet takes the color too. Null when
 * the lips and the skin look the same, as with a lipstick the color of the skin. `gap`, when given, takes
 * what stayed out inside the mouth: the opening as the photo shows it.
 */
export function lipsFromPhoto(
  rgba: Uint8ClampedArray,
  area: Area,
  outer: readonly Point[],
  inner: readonly Point[],
  opening: readonly Point[] | null,
  width: number,
  gap?: Float32Array,
): Float32Array | null {
  const body = cover(outer, area);
  const mouth = opening ? cover(inner, area) : new Float32Array(body.length);
  const n = body.length;
  const ring = new Float32Array(n);
  for (let i = 0; i < n; i++) ring[i] = body[i] * (1 - mouth[i]);
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
  const skinY: number[] = [];
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
      skinY.push(y[i]);
    }
  }
  if (lipR.length < MIN_LIP_SAMPLES || skinR.length < MIN_LIP_SAMPLES) return null;
  const sr = median(skinR);
  const sg = median(skinG);
  const dx = median(lipR) - sr;
  const dy = median(lipG) - sg;
  const size = dx * dx + dy * dy;
  if (Math.sqrt(size) < LIP_MIN_CONTRAST) return null;
  const my = Math.max(median(lipY), 0.05);
  const along = new Float32Array(n);
  for (let i = 0; i < n; i++) along[i] = Math.min(1.2, Math.max(-0.2, ((r[i] - sr) * dx + (g[i] - sg) * dy) / size));
  const colored = softBlur(along, area.w, area.h, Math.max(0.6, width * FIT_BLUR));
  // A glint is white, so by color it would look like skin: inside the contour it counts as lip, with the pale
  // halo around it. Nothing on a lip is brighter than the skin except light.
  const light = median(skinY);
  const glint = new Float32Array(n);
  for (let i = 0; i < n; i++) glint[i] = smooth(light * GLINT_FROM, light * GLINT_TO, y[i]) * body[i];
  const halo = softBlur(glint, area.w, area.h, Math.max(0.6, width * GLINT_HALO));
  // Its brightness does not count against the lip either, when the fit asks what is darker.
  const shaded = Float32Array.from(y);
  for (let i = 0; i < n; i++) {
    const held = smooth(0.08, 0.35, halo[i]) * body[i];
    along[i] = Math.max(along[i], held);
    shaded[i] = y[i] + (Math.min(y[i], my) - y[i]) * held;
  }
  const map = softBlur(along, area.w, area.h, Math.max(0.6, width * FIT_BLUR));
  const bright = softBlur(shaded, area.w, area.h, Math.max(0.6, width * FIT_BLUR));
  const fitted = fitContour(smoothLoop(outer, FIT_POINTS), map, area, width, bright);
  const soft = Math.max(0.5, width * LIP_FEATHER * 0.6);
  const edge = softBlur(cover(fitted, area), area.w, area.h, soft);
  if (!opening) return edge;
  // What is not the color of the lips, starting inside the opening: teeth and the dark of the mouth.
  const lipLike = new Float32Array(n);
  for (let i = 0; i < n; i++) lipLike[i] = smooth(LIP_FROM, LIP_TO, colored[i]) * smooth(MOUTH_DARK_LOW, MOUTH_DARK_HIGH, y[i] / my);
  const room = cover(outgrow(opening, width * MOUTH_ROOM), area);
  const seeds: number[] = [];
  for (let i = 0; i < n; i++) if (mouth[i] > 0.5 && lipLike[i] < MOUTH_SEED) seeds.push(i);
  const notLip = reached((i) => room[i] > 0.5 && lipLike[i] < MOUTH_SOLID, seeds, area.w, area.h);
  const hole = softBlur(Float32Array.from(notLip), area.w, area.h, soft);
  // The deep of a wide mouth stays out whatever its color, as a tongue. A narrow gap has no deep part.
  const deep = softBlur(mouth, area.w, area.h, Math.max(0.6, width * MOUTH_DEEP));
  for (let i = 0; i < n; i++) {
    const out = Math.max(smooth(0.72, 0.92, deep[i]), hole[i]);
    if (gap) gap[i] = edge[i] * out;
    edge[i] *= 1 - out;
  }
  return edge;
}

/**
 * The opening of every mouth, teeth and the dark behind them, as a mask from 0 to 255: what the lips slide over
 * when a slider shapes them. Read from the photo as the lips are, and from the outline of the model when the
 * photo does not tell lips from skin. Null when every mouth is closed.
 */
export function buildMouthMask(faces: readonly Face[], target: MaskTarget): Uint8Array | null {
  const out = new Uint8Array(target.w * target.h);
  for (const { parts } of faces) {
    if (parts.outerLips.length < 16 || parts.innerLips.length < 16) continue;
    const outer = toGrid(parts.outerLips, target);
    const inner = toGrid(parts.innerLips, target);
    const reach = lipReach(inner);
    if (reach <= 0) continue;
    const width = Math.hypot(outer[0][0] - outer[10][0], outer[0][1] - outer[10][1]) || 1;
    const area = areaAround(outer, width * (SKIN_TO + 0.05) + 2, target);
    if (area.w < 2 || area.h < 2) continue;
    const opening = inner.map(([x, y], i): Point => [x + (outer[i][0] - x) * reach, y + (outer[i][1] - y) * reach]);
    const rgba = target.color?.(area);
    const gap = new Float32Array(area.w * area.h);
    if (rgba && lipsFromPhoto(rgba, area, outer, inner, opening, width, gap)) {
      place(out, target, area, gap);
      continue;
    }
    const body = cover(outer, area);
    const hole = cover(opening, area);
    for (let i = 0; i < hole.length; i++) hole[i] *= body[i];
    place(out, target, area, softBlur(hole, area.w, area.h, Math.max(0.5, width * LIP_FEATHER)));
  }
  return out.some((v) => v > 0) ? out : null;
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
    // The opening of the teeth tool, so the two tools meet without a gap.
    const opening = inner.map(([x, y], i): Point => [x + (outer[i][0] - x) * reach, y + (outer[i][1] - y) * reach]);
    const rgba = target.color?.(area);
    const found = rgba ? lipsFromPhoto(rgba, area, outer, inner, reach > 0 ? opening : null, width) : null;
    if (found) {
      place(out, target, area, found);
      continue;
    }
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

/**
 * The two lines of a nose contour: down each edge of the bridge, from between the eyes to above the tip. Each
 * point of a side is moved away from the point of the middle at its height, so on a turned head the far line
 * stays as close to the middle as the nose shows it. A face with other lines, as one made by hand, keeps them.
 */
export function noseEdges(parts: FaceParts): readonly (readonly Point[])[] | undefined {
  const { noseSides, midline } = parts;
  if (!noseSides || midline?.length !== MIDLINE.length) return noseSides;
  return noseSides.map((line) => {
    if (line.length !== NOSE_SIDES[0].length) return line;
    // The middle has the top of the forehead first, then one point per height of a side.
    return line.map((p, i): Point => mid(midline[i + 1], p, NOSE_OUT));
  });
}

/** Under the cheekbones and along the sides of the face and of the nose, on the skin. Null when no face shows them. */
export function buildSculptMask(faces: readonly Face[], target: MaskTarget): Uint8Array | null {
  return buildOnSkin(faces, target, (face, shape, area) => {
    const { parts } = face;
    bandsOf(parts.hollows, target, parts, shape, area, HOLLOW_RADIUS, HOLLOW_PEAK);
    bandsOf(noseEdges(parts), target, parts, shape, area, NOSE_RADIUS, NOSE_PEAK);
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

/** The largest face as a share of the long side of the photo. Zero without a face. */
export function faceShare(faces: readonly Face[], w: number, h: number): number {
  const long = Math.max(w, h);
  return Math.max(0, ...faces.map(({ box }) => Math.max(box.w * w, box.h * h) / long));
}

/** Over the nose and the top of the cheeks, as sun freckles fall, on the skin. Null when no face shows them. */
export function buildSprinkleMask(faces: readonly Face[], target: MaskTarget): Uint8Array | null {
  return buildOnSkin(faces, target, ({ parts }, shape, area) => {
    bandsOf(parts.cheekTops, target, parts, shape, area, TOP_FRINGE, FRINGE_PEAK);
    bandsOf(parts.cheekTops, target, parts, shape, area, TOP_RADIUS, 1);
    if (!parts.cheekTops?.length || !parts.midline || parts.midline.length < 9) return;
    const line = toGrid(parts.midline, target);
    const widths = eyeWidths(parts, target);
    // The bridge of the nose joins the two cheeks, from the point between the eyes down to the tip.
    addBand(shape, area, [line[2], line[3], line[4], line[5]], ((widths[0] + widths[1]) / 2) * BRIDGE_RADIUS, 1);
  });
}
