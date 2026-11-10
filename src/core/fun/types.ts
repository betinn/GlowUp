/**
 * The terms of Brincar: the playful edits, kept apart from the realistic ones. An effect is a warp of a face,
 * worked out from its landmarks and one strength. A sticker is a picture made in the project, put on a face.
 * Each effect and each sticker lives in a file of its own and is listed once, in `effects/index.ts` or
 * `stickers/index.ts`. See "Brincar" in `docs/DESIGN.md`.
 */

import type { FaceShape } from '../doc';
import type { Piece } from '../face/reshape';
import type { Face } from '../face/scan';
import type { FaceFrame } from '../face/shape';

/** A point in shares of the long side of the photo, x right and y down. */
export type Vec = readonly [number, number];

/**
 * What a warp adds at a point, as the sliders of the face menu do: `add` writes how far away to read the photo,
 * in shares of the long side. `alone`, when there, is the share of it the body does not take, so the piece
 * moves a head over the body and the background behind it, which the plates fill. See `Piece` in
 * `core/face/reshape.ts`.
 */
export type FunPiece = Omit<Piece, 'overMouth'>;

/** One face, read for Brincar. Lengths are shares of the long side of the photo. */
export interface FunFace {
  face: Face;
  /** The frame of the face: its axis, its length, its width per height, its eyes. */
  frame: FaceFrame;
  /** The size of the photo in shares of its long side: a point in UV times these is a point here. */
  kx: number;
  ky: number;
  /** A landmark in UV, in these terms. */
  flat(point: readonly [number, number]): Vec;
}

/** A face effect: a warp of one face at a strength, as the slider of the menu gives it. */
export interface FunEffect {
  /** Saved in projects. Never change it once shipped. */
  id: string;
  /** The name of its slider, in pt-BR. */
  label: string;
  /** One short line under the slider, in pt-BR. */
  note?: string;
  /**
   * The warp moves a head over what is behind it, and needs the person apart from the background for that.
   * Without it, the menu says so, and the warp moves what is around the head too.
   */
  layered?: boolean;
  /** The pieces of the warp on one face, at `strength` from 0 (nothing) to 1 (the end of the slider). */
  pieces(face: FunFace, strength: number): FunPiece[];
}

/** What the document asks of the field of Brincar, for the page or a worker. */
export interface FunSource {
  kind: 'fun';
  /** The strength of each effect, 0..100, per face. */
  shapes: readonly FaceShape[];
  faces: readonly Face[];
  w: number;
  h: number;
}

/** Where a sticker sits: its middle, in shares of the long side, its width in the same unit, and its turn. */
export interface StickerPlace {
  x: number;
  y: number;
  size: number;
  /** Radians, clockwise on the screen. */
  angle: number;
}

/** The tabs of the grid of stickers in the menu. Their names and order are in `stickers/index.ts`. */
export type StickerGroup = 'oculos' | 'cabeca' | 'rosto' | 'volta';

/** A sticker: art made in the project, and where it goes on a face. */
export interface StickerDef {
  /** Saved in projects. Never change it once shipped. */
  id: string;
  /** Its name, in pt-BR, for the grid of the menu. */
  label: string;
  /** The tab of the grid it shows in. */
  group: StickerGroup;
  /**
   * A whole SVG document, with a `viewBox`. No text, no fonts, nothing from outside the file: a `url(#…)` may
   * name a gradient of the same file, and nothing else.
   */
  svg: string;
  /** Height over width of the art, as its `viewBox` says. */
  aspect: number;
  /** Where it goes on a face. Null when the face lacks what it needs, and it then goes to the middle of the face. */
  anchor(face: FunFace): StickerPlace | null;
}
