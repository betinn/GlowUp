/** Where a new sticker goes on a face. */

import type { StickerState } from '../doc';
import type { Face } from '../face/scan';
import { readFace } from './kit';
import type { StickerDef, StickerPlace } from './types';

/** Where a sticker goes on a face, in the terms of the document. Its own anchor, or else the middle of the face. */
export function placeOnFace(def: StickerDef, face: Face, w: number, h: number): Omit<StickerState, 'id' | 'kind' | 'at'> {
  const long = Math.max(w, h);
  const kx = w / long;
  const ky = h / long;
  const read = readFace(face, kx, ky);
  const anchored = read ? def.anchor(read) : null;
  const place: StickerPlace = anchored ?? {
    x: (face.box.x + face.box.w / 2) * kx,
    y: (face.box.y + face.box.h / 2) * ky,
    size: Math.max(face.box.w * kx, face.box.h * ky) * 0.6,
    angle: 0,
  };
  return { x: place.x / kx, y: place.y / ky, size: place.size, angle: place.angle };
}
