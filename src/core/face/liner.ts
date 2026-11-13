/**
 * The shapes of the eyeliner tools: a classic line with a short wing, and the fox eye, a long wing lifted
 * toward the end of the brow with the outer corner smoked. Plain arrays and no browser APIs, so every step
 * can be tested. Like the other regions, the shapes live in memory for the open photo and never reach the
 * saved project.
 *
 * A line this thin shows a slip of two pixels, and the contour of the model can sit a little off the lashes.
 * So the upper lid is moved onto the dark line of the lashes the photo shows, when it shows one.
 */

import { sampleAt } from './makeup';
import { softBlur, type Area, type MaskTarget, type Point } from './mask';
import type { Face } from './scan';
import { areaAround, cover, eyeFrame, mid, place, skinLikeness, smooth, toGrid } from './skin';

/** New points per stretch of the contour of the model, so the line is a curve and not a polygon. */
const CURVE_STEPS = 6;

/** Thickness of the classic line, as shares of the eye width: at the inner corner and where the wing starts. */
const LINE_IN = 0.02;
const LINE_OUT = 0.068;
/** The line thickens from this share of the way along the lid, from the inner corner out. */
const LINE_GROW = 0.3;
/** The top of the line leaves the lid for the tip of the wing at this share of the way. */
const LINE_JOIN = 0.8;
/** The wing of the classic line: its length past the outer corner, in eye widths, and its angle over the eye line. */
const WING_LENGTH = 0.27;
const WING_ANGLE = 22;

/** The fox line: thin until the middle of the lid, then dramatic. */
const FOX_IN = 0.022;
const FOX_OUT = 0.066;
const FOX_GROW = 0.35;
const FOX_JOIN = 0.84;
/** The long wing, and the angle it starts from before turning toward the end of the brow. */
const FOX_LENGTH = 0.46;
const FOX_ANGLE = 30;
/** How much the wing turns toward the end of the brow, and the angles it stays between. */
const FOX_TO_BROW = 0.45;
const FOX_MIN_ANGLE = 18;
const FOX_MAX_ANGLE = 38;
/** The point at the inner corner, toward the nose and down, as shares of the eye width. */
const FOX_INNER_IN = 0.12;
const FOX_INNER_DOWN = 0.05;
const FOX_INNER_BASE = 0.03;
/** The line under the outer part of the lower lid: where it starts and how thick it gets at the corner. */
const FOX_LOW_FROM = 0.55;
const FOX_LOW = 0.034;
/**
 * The smoked outer corner: from this share of the way along the lid, up to these shares of the way to the
 * brow, out past the tip of the wing, and a little under the outer part of the lower lid. Its strength is half
 * the line's, so the shader tells the two apart.
 */
const SMOKE_FROM = 0.45;
const SMOKE_UP_IN = 0.25;
const SMOKE_UP_OUT = 0.6;
const SMOKE_PAST = 0.14;
const SMOKE_UNDER = 0.07;
const SMOKE_LOW_FROM = 0.68;
const SMOKE_FEATHER = 0.07;
export const SMOKE_PEAK = 0.5;

/** Where the brush may go: up the lid this share of the way to the brow, past the corner, and under the lower lid. */
const REACH_UP = 0.7;
const REACH_PAST = 0.8;
const REACH_ANGLE = 32;
const REACH_UNDER = 0.16;

/**
 * Skin known for sure, to tell whether the lid is skin: a band over the brow, from this far above its top to
 * this far, in eye widths. Sunglasses rarely reach it. Below this share of skin on the lid, the eye is behind
 * something, as dark lenses, and gets no line.
 */
const FOREHEAD_FROM = 0.12;
const FOREHEAD_TO = 0.42;
const LID_SKIN = 0.3;
/** The band of the lid that is read for that, as shares of the way from the lashes to the brow. */
const LID_FROM = 0.2;
const LID_TO = 0.55;

/** Height of the lid as a share of the eye width, when the brow is not known. */
const NO_BROW = 0.45;
/** Softness of the line, as a share of the eye width, and never below this many pixels. */
const LINE_FEATHER = 0.007;
const MIN_FEATHER = 0.6;

/**
 * The search for the lashes along each point of the upper lid: how far into the eye and up the lid, in eye
 * widths, the blur of the photo first, and what a far step costs, in luma per eye width. On the real photos the
 * darkest spot was often a little under the contour of the model, where the lashes shade the top of the iris,
 * so the search goes only a little way into the eye: the line must not cover it.
 */
const LASH_DOWN = 0.02;
const LASH_UP = 0.06;
const LASH_BLUR = 0.01;
const LASH_COST = 0.6;
/** Below this gap in luma between the darkest and the lightest along a point, there is no line to find. */
const LASH_CONTRAST = 0.08;
/** The part of the lid that is searched, between the corners, and how many points must find the line. */
const LASH_FROM = 0.15;
const LASH_TO = 0.9;
const LASH_MIN_SHARE = 0.5;

const rad = (degrees: number) => (degrees * Math.PI) / 180;
const along = (p: Point, d: Point, by: number): Point => [p[0] + d[0] * by, p[1] + d[1] * by];
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
const median = (list: number[]) => list.sort((a, b) => a - b)[list.length >> 1];

/** An open curve through the points, with `steps` new points on each stretch, from the first to the last. */
export function smoothLine(points: readonly Point[], steps: number): Point[] {
  const n = points.length;
  if (n < 3) return [...points];
  const out: Point[] = [];
  for (let i = 0; i + 1 < n; i++) {
    const [p0, p1, p2, p3] = [points[Math.max(0, i - 1)], points[i], points[i + 1], points[Math.min(n - 1, i + 2)]];
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const blend = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
      out.push([blend(p0[0], p1[0], p2[0], p3[0]), blend(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(points[n - 1]);
  return out;
}

/** The point at share `t` of a line, by its points. */
function pointAt(line: readonly Point[], t: number): Point {
  const at = Math.min(1, Math.max(0, t)) * (line.length - 1);
  const i = Math.min(line.length - 2, Math.floor(at));
  return mid(line[i], line[i + 1], at - i);
}

/** One eye, on the grid, in the terms the lines are drawn in. */
export interface EyeLids {
  width: number;
  /** Across the eye, from the lower lid to the upper one. */
  up: Point;
  /** Along the eye, from the inner corner to the outer one. */
  out: Point;
  inner: Point;
  outer: Point;
  /** The lids, from the inner corner to the outer one, as curves. */
  upper: Point[];
  lower: Point[];
  /** From the upper lid to the bottom of the brow, at share `t` of the way out. */
  lidHeight(t: number): number;
  /** The outer end of the brow, when the brow is known. */
  tail?: Point;
}

/** The lids of one eye from the contour of the model, as `EYES` lists it, and the brow over it as `BROWS` does. */
export function eyeLids(eye: readonly Point[], brow?: readonly Point[]): EyeLids {
  const { width, down } = eyeFrame(eye);
  const up: Point = [-down[0], -down[1]];
  const outer = eye[0];
  const inner = eye[8];
  const out: Point = [(outer[0] - inner[0]) / width, (outer[1] - inner[1]) / width];
  const upper = smoothLine([eye[8], ...eye.slice(9), eye[0]], CURVE_STEPS);
  const lower = smoothLine([eye[8], ...eye.slice(1, 8).reverse(), eye[0]], CURVE_STEPS);
  // The bottom of the brow, from its inner end to the outer one.
  const bottom = brow && brow.length >= 10 ? [brow[5], brow[6], brow[7], brow[8], brow[9]] : null;
  const lidHeight = (t: number) => {
    if (!bottom) return width * NO_BROW;
    const h = dot([pointAt(bottom, t)[0] - pointAt(upper, t)[0], pointAt(bottom, t)[1] - pointAt(upper, t)[1]], up);
    return h > width * 0.1 ? h : width * NO_BROW;
  };
  const tail = bottom && brow ? mid(brow[0], brow[9]) : undefined;
  return { width, up, out, inner, outer, upper, lower, lidHeight, tail };
}

/**
 * Moves the upper lid onto the line of the lashes in `luma`, over `area`. Each point looks along the eye's up
 * for the darkest spot, and a far one costs more; the move is the median of the points that found a line, so
 * one dark iris or a lash apart does not bend it. The corners move less than the middle, since the model holds
 * them better. The lid stays as it was when the photo shows no line.
 */
export function fitLashes(lids: EyeLids, luma: Float32Array, area: Area): EyeLids {
  const { width, up, upper } = lids;
  const blurred = softBlur(luma, area.w, area.h, Math.max(MIN_FEATHER, width * LASH_BLUR));
  const step = 0.5;
  const from = -width * LASH_DOWN;
  const to = width * LASH_UP;
  const found: number[] = [];
  let tried = 0;
  upper.forEach((p, i) => {
    const t = i / (upper.length - 1);
    if (t < LASH_FROM || t > LASH_TO) return;
    tried++;
    let best = Infinity;
    let at = 0;
    let light = -Infinity;
    let dark = Infinity;
    for (let o = from; o <= to; o += step) {
      const v = sampleAt(blurred, area, p[0] + up[0] * o, p[1] + up[1] * o);
      light = Math.max(light, v);
      dark = Math.min(dark, v);
      const cost = v + (LASH_COST * Math.abs(o)) / width;
      if (cost < best) {
        best = cost;
        at = o;
      }
    }
    if (light - dark >= LASH_CONTRAST) found.push(at);
  });
  if (tried === 0 || found.length < tried * LASH_MIN_SHARE) return lids;
  const shift = median(found);
  const moved = upper.map((p, i): Point => {
    const t = i / (upper.length - 1);
    // Full in the middle of the lid, half at the corners.
    const share = 0.5 + 0.5 * Math.sin(Math.PI * t);
    return along(p, up, shift * share);
  });
  return { ...lids, upper: moved };
}

/** The tip of a wing: past the outer corner, lifted by an angle over the eye line. */
function wingTip({ outer, out, up, width }: EyeLids, length: number, angle: number): Point {
  const a = rad(angle);
  return [outer[0] + (out[0] * Math.cos(a) + up[0] * Math.sin(a)) * width * length, outer[1] + (out[1] * Math.cos(a) + up[1] * Math.sin(a)) * width * length];
}

/** The angle of the fox wing: between its own and the one toward the end of the brow. */
function foxAngle(lids: EyeLids): number {
  if (!lids.tail) return FOX_ANGLE;
  const to: Point = [lids.tail[0] - lids.outer[0], lids.tail[1] - lids.outer[1]];
  const brow = (Math.atan2(dot(to, lids.up), dot(to, lids.out)) * 180) / Math.PI;
  const angle = FOX_ANGLE + (brow - FOX_ANGLE) * FOX_TO_BROW;
  return Math.min(FOX_MAX_ANGLE, Math.max(FOX_MIN_ANGLE, angle));
}

/**
 * A line on the upper lid that grows from `thin` at the inner corner to `thick`, and leaves the lid at `join`
 * for the tip of a wing. Its bottom runs on the lid itself.
 */
function upperLine(lids: EyeLids, thin: number, thick: number, grow: number, join: number, tip: Point, innerTip?: Point): Point[] {
  const { upper, up, out, width, inner } = lids;
  const last = upper.length - 1;
  const top: Point[] = [];
  upper.forEach((p, i) => {
    const t = i / last;
    if (t > join) return;
    top.push(along(p, up, width * (thin + (thick - thin) * smooth(grow, 1, t))));
  });
  // The point at the inner corner gets a base under the corner too, so it is a wedge and not a hair.
  const base: Point[] = innerTip ? [along(along(inner, up, -width * FOX_INNER_BASE), out, -width * FOX_INNER_BASE * 0.5), innerTip] : [];
  return [...top, tip, ...[...upper].reverse(), ...base];
}

/** The classic line of one eye, as a polygon on the grid. */
export function linerShape(lids: EyeLids): Point[] {
  return upperLine(lids, LINE_IN, LINE_OUT, LINE_GROW, LINE_JOIN, wingTip(lids, WING_LENGTH, WING_ANGLE));
}

/** The fox line of one eye: the upper line with a point at the inner corner, and the line under the outer part of the lower lid. */
export function foxShapes(lids: EyeLids): { top: Point[]; bottom: Point[]; tip: Point; angle: number } {
  const angle = foxAngle(lids);
  const tip = wingTip(lids, FOX_LENGTH, angle);
  const { inner, out, up, width, lower, upper } = lids;
  const innerTip: Point = [inner[0] - out[0] * width * FOX_INNER_IN - up[0] * width * FOX_INNER_DOWN, inner[1] - out[1] * width * FOX_INNER_IN - up[1] * width * FOX_INNER_DOWN];
  const top = upperLine(lids, FOX_IN, FOX_OUT, FOX_GROW, FOX_JOIN, tip, innerTip);
  const last = lower.length - 1;
  const part = lower.filter((_, i) => i / last >= FOX_LOW_FROM);
  const under = part.map((p, i): Point => along(p, up, -width * FOX_LOW * smooth(0, 1, i / Math.max(1, part.length - 1))));
  // Through the corner of the upper lid too, which the lashes may have moved: the wing is filled to it.
  return { top, bottom: [...part, upper[upper.length - 1], tip, ...under.reverse()], tip, angle };
}

/** The smoked outer corner of one eye, as a polygon on the grid. It crosses the eye, which is cut out after. */
export function smokeShape(lids: EyeLids, angle: number): Point[] {
  const { upper, lower, up, out, width, outer, lidHeight } = lids;
  const top: Point[] = [];
  for (const t of [SMOKE_FROM, 0.6, 0.75, 0.9, 1]) {
    const k = (t - SMOKE_FROM) / (1 - SMOKE_FROM);
    top.push(along(pointAt(upper, t), up, lidHeight(t) * (SMOKE_UP_IN + (SMOKE_UP_OUT - SMOKE_UP_IN) * k)));
  }
  const far = wingTip(lids, FOX_LENGTH + SMOKE_PAST, angle);
  const corner = along(along(outer, up, -width * SMOKE_UNDER), out, width * SMOKE_UNDER);
  const under = along(pointAt(lower, (1 + SMOKE_LOW_FROM) / 2), up, -width * SMOKE_UNDER * 0.6);
  return [pointAt(upper, SMOKE_FROM), ...top, far, corner, under, pointAt(lower, SMOKE_LOW_FROM)];
}

/** Where the brush of a liner may go around one eye, eye included, as a polygon on the grid. */
export function reachShape(lids: EyeLids): Point[] {
  const { upper, lower, up, width, lidHeight } = lids;
  const last = upper.length - 1;
  const top = upper.map((p, i) => along(p, up, Math.max(width * 0.08, lidHeight(i / last) * REACH_UP)));
  const far = wingTip(lids, REACH_PAST, REACH_ANGLE);
  const under = lower.map((p) => along(p, up, -width * REACH_UNDER));
  return [...top, far, ...under.reverse()];
}

/** The forehead over a brow, as a polygon on the grid, or null without a brow. See `BROWS` for its order. */
function foreheadShape(lids: EyeLids, brow: readonly Point[] | undefined): Point[] | null {
  if (!brow || brow.length < 10) return null;
  const top = brow.slice(0, 5);
  const { up, width } = lids;
  return [...top.map((p) => along(p, up, width * FOREHEAD_FROM)), ...[...top].reverse().map((p) => along(p, up, width * FOREHEAD_TO))];
}

/** The lid between the lashes and the brow, as a polygon on the grid, where the color says whether it is skin. */
function lidBand({ upper, up, lidHeight }: EyeLids): Point[] {
  const last = upper.length - 1;
  const part = upper.map((p, i) => [p, i / last] as const).filter(([, t]) => t >= LASH_FROM && t <= LASH_TO);
  return [...part.map(([p, t]) => along(p, up, lidHeight(t) * LID_FROM)), ...part.reverse().map(([p, t]) => along(p, up, lidHeight(t) * LID_TO))];
}

/**
 * How much each pixel of `area` looks like the skin over the brow, or null when the photo does not say: no
 * color, no brow, or too little of it in the area.
 */
function skinOverBrow(rgba: Uint8ClampedArray | undefined, area: Area, forehead: Point[] | null): Float32Array | null {
  if (!rgba || !forehead) return null;
  return skinLikeness(rgba, cover(forehead, area));
}

/** The share of skin on the lid, from 0 to 1. */
function lidSkin(like: Float32Array, area: Area, lids: EyeLids): number {
  const band = cover(lidBand(lids), area);
  let sum = 0;
  let weight = 0;
  for (let i = 0; i < band.length; i++) {
    sum += like[i] * band[i];
    weight += band[i];
  }
  return weight > 0 ? sum / weight : 1;
}

export type LinerKind = 'reach' | 'line' | 'fox';

/**
 * The liners of every face, as a mask from 0 to 255. `line` is the classic line of the automatic mode, `fox`
 * the fox eye, with the line at full strength and the smoke at `SMOKE_PEAK`, and `reach` where the brush may
 * go. The opening of the eye stays out of all of them. Null when no eye was found.
 */
export function buildLinerMask(faces: readonly Face[], target: MaskTarget, kind: LinerKind): Uint8Array | null {
  const out = new Uint8Array(target.w * target.h);
  for (const { parts } of faces) {
    for (const [side, eye] of parts.eyes.entries()) {
      if (eye.length < 16) continue;
      const grid = toGrid(eye, target);
      const brow = parts.brows?.[side] ? toGrid(parts.brows[side], target) : undefined;
      let lids = eyeLids(grid, brow);
      const { width } = lids;
      const smokeSigma = width * SMOKE_FEATHER;
      // Room for the smoke, which goes past the reach of the brush when the wing turns up the most.
      const forehead = foreheadShape(lids, brow);
      const area = areaAround([...reachShape(lids), wingTip(lids, FOX_LENGTH + SMOKE_PAST, FOX_MAX_ANGLE), ...(forehead ?? [])], smokeSigma * 3 + 2, target);
      if (area.w < 2 || area.h < 2) continue;
      const luma = target.luma?.(area);
      if (luma) lids = fitLashes(lids, luma, area);
      // An eye behind dark lenses has a guess of the model where the lid is, and a line there would sit on the glass.
      const like = skinOverBrow(target.color?.(area), area, forehead);
      if (like && lidSkin(like, area, lids) < LID_SKIN) continue;
      const sigma = Math.max(MIN_FEATHER, width * LINE_FEATHER);
      // The opening of the eye, under the fitted lid.
      const opening = softBlur(cover([...lids.upper, ...[...lids.lower].reverse()], area), area.w, area.h, sigma * 0.5);
      let shape: Float32Array;
      if (kind === 'reach') {
        shape = softBlur(cover(reachShape(lids), area), area.w, area.h, width * 0.03);
      } else if (kind === 'line') {
        shape = softBlur(cover(linerShape(lids), area), area.w, area.h, sigma);
      } else {
        const fox = foxShapes(lids);
        const line = cover(fox.top, area);
        const below = cover(fox.bottom, area);
        for (let i = 0; i < line.length; i++) line[i] = Math.min(1, line[i] + below[i]);
        const sharp = softBlur(line, area.w, area.h, sigma);
        const smoke = softBlur(cover(smokeShape(lids, fox.angle), area), area.w, area.h, smokeSigma);
        // The smoke stays on skin: off the brow, the frame of glasses and the hair.
        const skin = like ? softBlur(like, area.w, area.h, Math.max(1, width * 0.02)) : null;
        shape = new Float32Array(sharp.length);
        for (let i = 0; i < shape.length; i++) shape[i] = Math.max(sharp[i], smoke[i] * SMOKE_PEAK * (skin ? smooth(0.1, 0.6, skin[i]) : 1));
      }
      for (let i = 0; i < shape.length; i++) shape[i] *= 1 - opening[i];
      place(out, target, area, shape);
    }
  }
  return out.some((v) => v > 0) ? out : null;
}
