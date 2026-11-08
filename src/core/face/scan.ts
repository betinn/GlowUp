/**
 * Plans the search for faces and merges what it finds. No browser APIs, so it can be tested alone.
 *
 * The detector sees its input at 128 px, which is made for a face close to the camera. On real group
 * photos a pass over the whole image found nobody, so the search goes over overlapping tiles, each
 * level at half the size of the one before. A face needs about a tenth of the tile to be found.
 */

import { bounds, type Area, type Point } from './mask';

export interface ScanLevel {
  /** Side of a tile, as a fraction of the long side of the photo. */
  side: number;
  /** Tiles are scaled down to this many pixels at most. */
  limit: number;
}

export const SCAN_LEVELS: readonly ScanLevel[] = [
  { side: 1, limit: 1280 },
  { side: 1 / 2, limit: 1280 },
  { side: 1 / 4, limit: 1024 },
  { side: 1 / 8, limit: 640 },
];

/** With half a tile of overlap, any face smaller than half a tile fits whole in some tile. */
const OVERLAP = 0.5;

/** Two outlines overlapping this much are the same face seen from two tiles. */
const SAME_FACE = 0.3;

/** The silhouette of a face in the landmark list, in order, starting at the top of the forehead. */
export const FACE_OVAL: readonly number[] = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
];

/** Position of the bottom of the chin inside `FACE_OVAL`. */
export const CHIN = FACE_OVAL.indexOf(152);

/** Contours of the eyes and four points on the edge of each iris, as the landmark list numbers them. */
export const EYES: readonly (readonly number[])[] = [
  [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
  [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466],
];
export const IRISES: readonly (readonly number[])[] = [
  [469, 470, 471, 472],
  [474, 475, 476, 477],
];

/** Lips, from the left corner along the lower lip. The same position in each list faces the same point. */
export const INNER_LIPS: readonly number[] = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191];
export const OUTER_LIPS: readonly number[] = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];

/** Eyebrows, along the top from the outer end, then back along the bottom. Same order as `EYES`. */
export const BROWS: readonly (readonly number[])[] = [
  [70, 63, 105, 66, 107, 55, 65, 52, 53, 46],
  [300, 293, 334, 296, 336, 285, 295, 282, 283, 276],
];

/**
 * Points down the middle of the face: the forehead, the bridge of the nose to its tip, then the chin.
 * Along the bridge each one touches the next in the mesh of the model.
 */
export const MIDLINE: readonly number[] = [151, 168, 6, 197, 195, 5, 4, 1, 199];

/** Where the tools for eyes, teeth and skin may go, in image UV. */
export interface FaceParts {
  eyes: readonly (readonly Point[])[];
  irises: readonly (readonly Point[])[];
  innerLips: readonly Point[];
  outerLips: readonly Point[];
  /** Absent on faces made by hand in tests. The skin tools then do without them. */
  brows?: readonly (readonly Point[])[];
  midline?: readonly Point[];
}

const NO_PARTS: FaceParts = { eyes: [], irises: [], innerLips: [], outerLips: [] };

/** A face found in the photo. Only these shapes are kept, in image UV, and only in memory. */
export interface Face {
  outline: readonly Point[];
  box: Area;
  parts: FaceParts;
}

function starts(length: number, side: number): number[] {
  if (side >= length) return [0];
  const step = Math.max(1, Math.round(side * (1 - OVERLAP)));
  const list: number[] = [];
  for (let at = 0; ; at += step) {
    const fitted = Math.min(at, length - side);
    list.push(fitted);
    if (fitted + side >= length) return list;
  }
}

/** Tiles of one level, in pixels of the photo. */
export function tileGrid(w: number, h: number, level: ScanLevel): Area[] {
  const side = Math.max(1, Math.round(Math.max(w, h) * level.side));
  const tiles: Area[] = [];
  for (const y of starts(h, side)) {
    for (const x of starts(w, side)) tiles.push({ x, y, w: Math.min(side, w), h: Math.min(side, h) });
  }
  return tiles;
}

function overlap(a: Area, b: Area): number {
  const iw = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const ih = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const shared = iw * ih;
  return shared / Math.max(a.w * a.h + b.w * b.h - shared, 1e-12);
}

export function makeFace(outline: readonly Point[], parts = NO_PARTS): Face {
  return { outline, box: bounds(outline), parts };
}

/** Keeps from the landmark list only what the mask of the filter and the brush limits need. */
export function readFace(point: (index: number) => Point): Face {
  const read = (list: readonly number[]) => list.map(point);
  return makeFace(read(FACE_OVAL), {
    eyes: EYES.map(read),
    irises: IRISES.map(read),
    innerLips: read(INNER_LIPS),
    outerLips: read(OUTER_LIPS),
    brows: BROWS.map(read),
    midline: read(MIDLINE),
  });
}

/**
 * Adds a face unless it is already known. Of two views of one face the larger wins, because
 * a face cut by the edge of a tile comes out smaller. Returns true for a new face.
 */
export function addFace(faces: Face[], face: Face): boolean {
  const same = faces.findIndex((f) => overlap(f.box, face.box) > SAME_FACE);
  if (same < 0) {
    faces.push(face);
    return true;
  }
  if (face.box.w * face.box.h > faces[same].box.w * faces[same].box.h) faces[same] = face;
  return false;
}

/**
 * After a level, goes on while nothing was found yet or the level brought new faces.
 * A photo with one close face stops early, and a group goes down to the finest tiles.
 */
export const keepScanning = (total: number, added: number) => total === 0 || added > 0;

/** Reading order, so keyboards and screen readers go through the rings from left to right. */
export function byPosition(a: Face, b: Face): number {
  return a.box.x + a.box.w / 2 - (b.box.x + b.box.w / 2);
}
