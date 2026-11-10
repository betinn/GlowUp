/**
 * Where the stickers of this folder sit on a face: the line of the eyes, the top of the head, the lip, the nose,
 * the cheeks. Plain math on the landmarks, so each anchor can be tested without a GPU. Lengths are shares of the
 * long side of the photo, as in `FunFace`.
 */

import { eyesOf, middleOf } from '../kit';
import type { FunFace, StickerPlace, Vec } from '../types';

/** The turn of a face on the screen: its angle, and the way right and down along the face. */
export interface Pose {
  /** Radians, clockwise on the screen. */
  angle: number;
  right: Vec;
  down: Vec;
}

export const poseAt = (angle: number): Pose => ({ angle, right: [Math.cos(angle), Math.sin(angle)], down: [-Math.sin(angle), Math.cos(angle)] });

/**
 * The turn of a face: the line of the eyes when it has two, which holds on a head turned to the side, or else
 * the line from the forehead to the chin.
 */
export function poseOf(read: FunFace): Pose {
  const eyes = eyesOf(read);
  if (eyes.length >= 2) {
    const [a, b] = [eyes[0].c, eyes[eyes.length - 1].c];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 0) return poseAt(Math.atan2(b[1] - a[1], b[0] - a[0]));
  }
  const { dx, dy } = read.frame;
  return poseAt(Math.atan2(-dx, dy));
}

/** `p` moved by `right` and `down` lengths along the face. */
export const along = (p: Vec, pose: Pose, right: number, down: number): Vec => [
  p[0] + pose.right[0] * right + pose.down[0] * down,
  p[1] + pose.right[1] * right + pose.down[1] * down,
];

export const mix = (a: Vec, b: Vec, t: number): Vec => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

export const dist = (a: Vec, b: Vec) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/**
 * The place of a sticker `size` wide whose art has the point at `fx, fy` (shares of its width and height, from
 * its top left) on `at`, turned as the face is.
 */
export function pin(at: Vec, pose: Pose, size: number, aspect: number, fx: number, fy: number): StickerPlace {
  const [x, y] = along(at, pose, (0.5 - fx) * size, (0.5 - fy) * size * aspect);
  return { x, y, size, angle: pose.angle };
}

/**
 * Glasses whose lenses are `span` widths of the art apart, middle to middle, with the middle of the lenses at
 * `fy` of its height. Null without two eyes.
 */
export function onEyes(read: FunFace, span: number, aspect: number, fy = 0.5): StickerPlace | null {
  const eyes = eyesOf(read);
  if (eyes.length < 2) return null;
  const [a, b] = [eyes[0].c, eyes[eyes.length - 1].c];
  const apart = dist(a, b);
  if (apart <= 0) return null;
  return pin(mix(a, b, 0.5), poseOf(read), apart / span, aspect, 0.5, fy);
}

/**
 * How far above the top of the outline the top of the skull is, in lengths of the face. The outline of the
 * detector starts high on the forehead, under the hair.
 */
const SKULL_ABOVE = 0.3;

/** A head: the top of the skull, the top of the outline, how wide it is, and its turn. */
export interface Head {
  /** The top of the skull, over the middle of the head. Hair may go higher. */
  top: Vec;
  /** The top of the outline of the face, over the middle of the head. */
  brow: Vec;
  /** The width of the face from side to side, along the line of the eyes. */
  width: number;
  /** From the top of the outline to the chin. */
  length: number;
  pose: Pose;
}

/**
 * The head of a face. Its middle is the middle of the outline from side to side, which stays over the skull on
 * a head turned to the side, where the nose does not.
 */
export function headOf(read: FunFace): Head {
  const pose = poseOf(read);
  const { frame } = read;
  const outline = read.face.outline.map((p) => read.flat(p));
  const o: Vec = [frame.ox, frame.oy];
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of outline) {
    const side = (p[0] - o[0]) * pose.right[0] + (p[1] - o[1]) * pose.right[1];
    lo = Math.min(lo, side);
    hi = Math.max(hi, side);
  }
  const width = Number.isFinite(lo) && hi > lo ? hi - lo : frame.halfWidth * 2;
  const brow = along(o, pose, Number.isFinite(lo) ? (lo + hi) / 2 : 0, 0);
  // A face seen from the side is narrow, but the head is not.
  const wide = Math.max(width, frame.length * 0.78);
  return { top: along(brow, pose, 0, -frame.length * SKULL_ABOVE), brow, width: wide, length: frame.length, pose };
}

/**
 * A hat or ears, `share` of the width of the head wide, with the point at `fx, fy` of the art at `sink` lengths
 * of the face below the top of the skull.
 */
export function onHead(read: FunFace, share: number, aspect: number, fx: number, fy: number, sink: number): StickerPlace {
  const head = headOf(read);
  return pin(along(head.top, head.pose, 0, head.length * sink), head.pose, head.width * share, aspect, fx, fy);
}

/**
 * Around the head: art whose ring of little things has its middle at `fx, fy` and a radius of `radius` widths of
 * the art, round a point a little below the top of the outline.
 */
export function aroundHead(read: FunFace, radius: number, aspect: number, fx: number, fy: number): StickerPlace {
  const head = headOf(read);
  const middle = along(head.brow, head.pose, 0, head.length * 0.12);
  const reach = Math.max(head.width * 0.78, head.length * 0.72);
  return pin(middle, head.pose, reach / radius, aspect, fx, fy);
}

/** The mouth: its two corners, the top of the upper lip, and the base of the nose above it. Null without lips. */
export function mouthOf(read: FunFace): { left: Vec; right: Vec; lipTop: Vec; noseBase: Vec; width: number } | null {
  const lips = read.face.parts.outerLips;
  if (lips.length < 20) return null;
  const left = read.flat(lips[0]);
  const right = read.flat(lips[10]);
  const lipTop = read.flat(lips[15]);
  const width = dist(left, right);
  if (width <= 0) return null;
  const marks = read.face.parts.marks;
  const noseBase = marks ? read.flat(marks.noseBase) : along(lipTop, poseOf(read), 0, -width * 0.3);
  return { left, right, lipTop, noseBase, width };
}

/** The tip of the nose and the width across its wings. Null without them. */
export function noseOf(read: FunFace): { tip: Vec; width: number } | null {
  const marks = read.face.parts.marks;
  if (!marks) return null;
  const [a, b] = marks.noseWings.map((p) => read.flat(p));
  const width = a && b ? dist(a, b) : 0;
  if (width <= 0) return null;
  return { tip: read.flat(marks.noseTip), width };
}

/** The apple of each cheek, left of the photo first. Null without them. */
export function cheeksOf(read: FunFace): [Vec, Vec] | null {
  const cheeks = read.face.parts.cheeks;
  if (!cheeks || cheeks.length < 2 || !cheeks[0].length || !cheeks[1].length) return null;
  const a = read.flat(cheeks[0][0]);
  const b = read.flat(cheeks[1][0]);
  return a[0] <= b[0] ? [a, b] : [b, a];
}

/** The middle of the lower lid of the eye on the left of the photo, and the width of that eye. */
export function lowerLidOf(read: FunFace): { at: Vec; width: number } | null {
  const eyes = read.face.parts.eyes.filter((eye) => eye.length >= 9);
  if (!eyes.length) return null;
  const eye = eyes.reduce((a, b) => (middleOf(read, a)[0] <= middleOf(read, b)[0] ? a : b));
  const width = dist(read.flat(eye[0]), read.flat(eye[8]));
  if (width <= 0) return null;
  return { at: read.flat(eye[4]), width };
}

/**
 * A mustache `share` of the width of the mouth wide, with the point at `fx, fy` of the art between the base of
 * the nose and the top of the upper lip, a little nearer the lip. Null without lips.
 */
export function overLip(read: FunFace, share: number, aspect: number, fx: number, fy: number): StickerPlace | null {
  const mouth = mouthOf(read);
  if (!mouth) return null;
  return pin(mix(mouth.noseBase, mouth.lipTop, 0.58), poseOf(read), mouth.width * share, aspect, fx, fy);
}
