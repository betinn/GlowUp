/**
 * Turns the landmarks of the eyes and the mouth into a soft limit for the brush. Plain arrays and no
 * browser APIs, so every step can be tested. The result is only a shape, built for the open photo:
 * it lives in memory and never reaches the saved project.
 */

import { buildBrowMask, buildCheekMask, buildLidMask, buildLipMask, buildSculptMask, buildSprinkleMask, lipReach } from './makeup';
import { bounds, guidedFilter, softBlur, type Area, type MaskTarget, type Point } from './mask';
import type { Face, FaceParts } from './scan';
import { areaAround, buildGlowMask, buildSkinMask, buildUnderEyeMask, cover, place, smooth, toGrid } from './skin';

/**
 * Parts of the face drawn from the landmarks. `glow`, `browhair`, `shadow`, `cheeks`, `sculpt` and
 * `sprinkle` are not limits but shapes the automatic mode fills with: see `skin.ts` and `makeup.ts`.
 */
export type LandmarkRegion =
  | 'iris'
  | 'sclera'
  | 'teeth'
  | 'skin'
  | 'undereye'
  | 'glow'
  | 'lips'
  | 'brows'
  | 'browhair'
  | 'lids'
  | 'shadow'
  | 'cheeks'
  | 'sculpt'
  | 'sprinkle';

/** Hair comes from its own segmenter, not from the landmarks: see `hair.ts`. */
export type FaceRegion = LandmarkRegion | 'hair';

/** The contour of the eye runs on the lash line, so the iris gets a little room past it. */
const EYE_ROOM = 1.12;
/**
 * With the photo at hand, the iris is looked for inside a circle a little larger than the one the model
 * gives, and inside a contour with more room, since on a tilted head the contour of the model can cut
 * the iris.
 */
const IRIS_REACH = 1.05;
/**
 * Room past the contour of the model, as shares of the radius of the iris. Below and at the corners the
 * photo tells iris from skin and white, so the room is wide. Above, the lashes and the shadow of the lid
 * are as dark as the iris and touch it, so the contour itself is the limit, with little room.
 */
const LASH_ROOM = 0.12;
const LID_ROOM = 0.45;
const CORNER_ROOM = 0.5;
/** Where the iris and its surroundings are sampled, as shares of the radius. */
const IRIS_CORE = 0.7;
const AROUND_FROM = 1.2;
const AROUND_TO = 1.8;
/** Below this gap in luma between the surroundings and the iris, the photo cannot tell them apart. */
const MIN_CONTRAST = 0.06;
const SHARP_FEATHER = 0.05;
/**
 * Skin, lashes and the shadow of the lid can be as dark as the iris, but they are redder. Redness here is
 * red minus green over the sum of the channels; past the iris by the first step it starts to leave, past the
 * second it is gone. A brown iris is red too, and its reference moves with it. The reference is the redness
 * a share of the middle stays under, so skin that the circle of the model caught does not set it.
 */
const REDDER_FROM = 0.055;
const REDDER_TO = 0.1;
const BODY_RED = 0.35;
/** A piece of iris this much smaller than the largest one is a lash or a shadow apart from it. */
const SMALL_PIECE = 0.2;
/**
 * Under the upper lid the iris is in shadow, and the shadow is redder than the iris in the light. What is
 * at least this dark, of the way from the surroundings to the iris, and lies between the iris and the upper
 * lid, is iris, unless it is redder than the iris by more than a shadow makes it: then it is lashes.
 */
const SHADOW_DEPTH = 0.75;
const SHADOW_RED = 0.2;
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
const REFINE_RADIUS = 0.03;
const REFINE_EPS = 0.0015;

const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function around(points: readonly Point[], factor: number): Point[] {
  const box = bounds(points);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return points.map(([x, y]): Point => [cx + (x - cx) * factor, cy + (y - cy) * factor]);
}

/**
 * The contour of an eye with room for the iris the model cut. The contour starts at a corner, runs along the
 * lower lid to the other corner and comes back along the upper lid, as `EYES` lists it.
 */
function withRoom(contour: readonly Point[], radius: number): { shape: Point[]; up: Point } {
  const half = contour.length >> 1;
  const [ax, ay] = contour[0];
  const [bx, by] = contour[half];
  const length = Math.hypot(bx - ax, by - ay) || 1;
  const ux = (bx - ax) / length;
  const uy = (by - ay) / length;
  // Across the eye, toward the upper lid.
  let side = 0;
  for (let i = half + 1; i < contour.length; i++) side += (contour[i][0] - ax) * -uy + (contour[i][1] - ay) * ux;
  const up: Point = side < 0 ? [uy, -ux] : [-uy, ux];
  const shape = contour.map(([x, y], i): Point => {
    if (i === 0) return [x - ux * radius * CORNER_ROOM, y - uy * radius * CORNER_ROOM];
    if (i === half) return [x + ux * radius * CORNER_ROOM, y + uy * radius * CORNER_ROOM];
    const room = radius * (i > half ? LASH_ROOM : -LID_ROOM);
    return [x + up[0] * room, y + up[1] * room];
  });
  return { shape, up };
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

/** The value a share of the list stays under. */
const quantile = (list: number[], share: number) => list.sort((a, b) => a - b)[Math.min(list.length - 1, Math.floor(list.length * share))];
const median = (list: number[]) => quantile(list, 0.5);

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

/**
 * The iris as the photo shows it, over `area`. First what is iris for sure: as dark as the middle of the
 * iris, against the skin and white around it, and not redder than it. The circle of the model moves to
 * where that is. Then the shape is closed: see `closed` and `raised`. Null when the photo cannot tell the
 * iris from its surroundings, as with dark skin and dark eyes, or when the area is too small.
 */
export function irisFromPhoto(
  luma: Float32Array,
  rgba: Uint8ClampedArray | undefined,
  area: Area,
  given: Point,
  radius: number,
  contour: readonly Point[],
): Float32Array | null {
  const { shape, up } = withRoom(contour, radius);
  const opening = cover(shape, area);
  const inside: number[] = [];
  const outside: number[] = [];
  const red = new Float32Array(luma.length);
  for (let y = 0; y < area.h; y++) {
    for (let x = 0; x < area.w; x++) {
      const i = y * area.w + x;
      const d = Math.hypot(x + area.x + 0.5 - given[0], y + area.y + 0.5 - given[1]) / radius;
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
  const reference = rgba && body.length >= 8 ? quantile(body.map((i) => red[i]), BODY_RED) : null;
  const shade = new Float32Array(luma.length);
  const sure = new Float32Array(luma.length);
  for (let i = 0; i < sure.length; i++) {
    const depth = (light - luma[i]) / (light - dark);
    shade[i] = depth >= SHADOW_DEPTH && (reference === null || red[i] <= reference + SHADOW_RED) ? opening[i] : 0;
    sure[i] = smooth(0.35, 0.65, depth) * opening[i];
    if (reference !== null) sure[i] *= 1 - smooth(reference + REDDER_FROM, reference + REDDER_TO, red[i]);
  }
  const center = bestCenter(sure, area, given, radius);
  const big = cover(
    Array.from({ length: CIRCLE_SIDES }, (_, i): Point => {
      const a = (i / CIRCLE_SIDES) * Math.PI * 2;
      return [center[0] + Math.cos(a) * radius * IRIS_REACH, center[1] + Math.sin(a) * radius * IRIS_REACH];
    }),
    area,
  );
  for (let i = 0; i < sure.length; i++) {
    sure[i] *= big[i];
    shade[i] *= big[i];
  }
  const outline = closed(sure, area);
  if (!outline) return null;
  const whole = feather(cover(raised(outline, shade, area, up), area), area.w, area.h, radius * SHARP_FEATHER);
  for (let i = 0; i < whole.length; i++) whole[i] *= opening[i] * big[i];
  return whole;
}

/**
 * A soft edge of about `sigma` pixels. Three box blurs only come close to it from two pixels on, and on a
 * small iris they would spread the edge over the white of the eye, so below that it is done in small steps.
 */
function feather(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  if (sigma >= 2) return softBlur(src, w, h, sigma);
  let from = src;
  // Each pass of 1 2 1 adds half a pixel of variance.
  for (let pass = Math.round(2 * sigma * sigma); pass > 0; pass--) {
    const across = new Float32Array(from.length);
    const out = new Float32Array(from.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        across[i] = (from[x > 0 ? i - 1 : i] + 2 * from[i] + from[x < w - 1 ? i + 1 : i]) / 4;
      }
    }
    for (let i = 0; i < out.length; i++) out[i] = (across[i >= w ? i - w : i] + 2 * across[i] + across[i + w < out.length ? i + w : i]) / 4;
    from = out;
  }
  return from;
}

/** The convex outline around points, by the monotone chain. */
export function hull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length < 3) return sorted;
  const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: Point[]) => {
    const out: Point[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(sorted), ...half(sorted.reverse())];
}

/**
 * The corners of a pixel of `area`, on the grid. A pixel on the edge of the iris is part iris and part
 * white: one that is half iris has the edge through its middle, so it counts as its middle alone, and
 * `share` goes from there to the whole pixel.
 */
function corners(i: number, area: Area, share = 1): Point[] {
  const x = (i % area.w) + area.x + 0.5;
  const y = Math.floor(i / area.w) + area.y + 0.5;
  const half = share / 2;
  return [
    [x - half, y - half],
    [x + half, y - half],
    [x - half, y + half],
    [x + half, y + half],
  ];
}

/**
 * The iris the lids leave to see is one shape with no dents: a disc cut by two lids that curve away from it.
 * So what the photo shows of it is closed into its convex outline, and whatever lies inside counts as iris:
 * the glint of a light, the pupil, a fleck. Pieces much smaller than the largest are lashes and shadows
 * apart from the iris, and stay out so they do not pull the outline. Null when nothing is iris.
 */
function closed(sure: Float32Array, area: Area): Point[] | null {
  const { w, h } = area;
  const piece = new Int32Array(sure.length).fill(-1);
  const pieces: number[][] = [];
  for (let start = 0; start < sure.length; start++) {
    if (sure[start] < 0.5 || piece[start] >= 0) continue;
    const list = [start];
    piece[start] = pieces.length;
    for (let at = 0; at < list.length; at++) {
      const i = list[at];
      const x = i % w;
      for (const n of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (n < 0 || n >= w * h || piece[n] >= 0 || sure[n] < 0.5) continue;
        piece[n] = pieces.length;
        list.push(n);
      }
    }
    pieces.push(list);
  }
  if (pieces.length === 0) return null;
  const largest = Math.max(...pieces.map((list) => list.length));
  return hull(pieces.filter((list) => list.length >= largest * SMALL_PIECE).flatMap((list) => list.flatMap((i) => corners(i, area, 2 * sure[i] - 1))));
}

/**
 * Raises the outline to the upper lid. The lid throws a shadow on the top of the iris, and the shadow is
 * redder than the iris, so the color leaves it out. What is in `shade` from the outline on, going across the
 * eye toward the upper lid, is that shadow on the iris. The room over the contour of the model is where it ends.
 */
function raised(outline: Point[], shade: Float32Array, area: Area, up: Point): Point[] {
  const { w, h } = area;
  const within = cover(outline, area);
  const added: Point[] = [];
  const reach = w + h;
  for (let i = 0; i < shade.length; i++) {
    if (shade[i] < 0.5 || within[i] >= 0.5) continue;
    const x = i % w;
    const y = (i - x) / w;
    for (let step = 1; step < reach; step++) {
      const nx = Math.round(x - up[0] * step);
      const ny = Math.round(y - up[1] * step);
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) break;
      const n = ny * w + nx;
      if (within[n] >= 0.5) {
        added.push(...corners(i, area));
        break;
      }
      if (shade[n] < 0.5) break;
    }
  }
  return added.length ? hull([...outline, ...added]) : outline;
}

function addEye(out: Uint8Array, target: MaskTarget, region: 'iris' | 'sclera', eye: readonly Point[], ring: readonly Point[]): void {
  const contour = toGrid(eye, target);
  const { outline, radius } = circleThrough(toGrid(ring, target));
  const sigma = radius * IRIS_FEATHER;
  const roomy = around(contour, EYE_ROOM);
  const area = areaAround([...withRoom(contour, radius).shape, ...outline], radius * (AROUND_TO - 1) + sigma * 3 + 2, target);
  if (area.w < 1 || area.h < 1) return;
  const luma = target.luma?.(area);
  const box = bounds(outline);
  const found = luma ? irisFromPhoto(luma, target.color?.(area), area, [box.x + box.w / 2, box.y + box.h / 2], radius, contour) : null;
  if (found && region === 'iris') {
    place(out, target, area, found);
    return;
  }
  const disc = cover(outline, area);
  const opening = cover(region === 'iris' ? roomy : contour, area);
  // The white ends where the iris of the photo begins, which the circle of the model can miss.
  const iris = found ?? disc;
  const shape = new Float32Array(disc.length);
  for (let i = 0; i < shape.length; i++) shape[i] = opening[i] * (region === 'iris' ? disc[i] : 1 - iris[i]);
  const soft = softBlur(shape, area.w, area.h, sigma);
  // The soft edge of the white must not reach over the iris.
  if (found) for (let i = 0; i < soft.length; i++) soft[i] *= 1 - found[i];
  place(out, target, area, soft);
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
  if (region === 'lips') return buildLipMask(faces, target);
  if (region === 'brows' || region === 'browhair') return buildBrowMask(faces, target, region === 'browhair');
  if (region === 'lids' || region === 'shadow') return buildLidMask(faces, target, region === 'shadow');
  if (region === 'cheeks') return buildCheekMask(faces, target);
  if (region === 'sculpt') return buildSculptMask(faces, target);
  if (region === 'sprinkle') return buildSprinkleMask(faces, target);
  const out = new Uint8Array(target.w * target.h);
  for (const { parts } of faces) {
    if (region === 'teeth') addTeeth(out, target, parts);
    else parts.eyes.forEach((eye, i) => addEye(out, target, region, eye, parts.irises[i]));
  }
  return out.some((value) => value > 0) ? out : null;
}
