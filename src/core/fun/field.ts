/**
 * The field of Brincar, from the numbers of its effects. It is a field of its own: it never goes into the field
 * of Liquify and the face menu, nor under their limits. `develop.frag` puts it on top of theirs: a point of the
 * photo goes by the playful warp first and the realistic one after, so the playful one bends the face as the
 * realistic tools left it. See "Brincar" in `docs/DESIGN.md`.
 */

import { faceAt, fieldOf } from '../face/reshape';
import type { ShapeField } from '../face/shape';
import { funEffectById } from './effects/index';
import { readFace } from './kit';
import type { FunPiece, FunSource } from './types';

/** The field of every effect of every face, or null when none moves anything. */
export function funFieldFrom({ shapes, faces, w, h }: FunSource): ShapeField | null {
  const long = Math.max(w, h);
  const kx = w / long;
  const ky = h / long;
  const pieces: FunPiece[] = [];
  for (const shape of shapes) {
    const face = faceAt(faces, shape.at);
    if (!face) continue;
    const read = readFace(face, kx, ky);
    if (!read) continue;
    for (const [id, value] of Object.entries(shape.values)) {
      const effect = funEffectById(id);
      if (!effect || !(value > 0)) continue;
      pieces.push(...effect.pieces(read, Math.min(100, value) / 100));
    }
  }
  if (!pieces.length) return null;
  const field = fieldOf(pieces, kx, ky);
  // Nothing of Brincar slides lips over teeth.
  return { offset: field.offset, alone: field.alone, area: field.area };
}
