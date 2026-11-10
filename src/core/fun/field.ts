/**
 * The field of Brincar, from the numbers of its effects. It is a field of its own: it never goes into the field
 * of Liquify and the face menu, nor under their limits. `develop.frag` puts it on top of theirs: a point of the
 * photo goes by the playful warp first and the realistic one after, so the playful one bends the face as the
 * realistic tools left it. See "Brincar" in `docs/DESIGN.md`.
 *
 * Effects stack in the order of `FUN_EFFECTS`. Each one bends the photo as the ones before it left it, and reads
 * the face there: a big nose grows with the head it is on, and a head grows with the chin it was given. Warps
 * that never fold, one after the other, never fold either, where adding them up could.
 */

import { faceAt, fieldOf } from '../face/reshape';
import { makeFace, type Face, type FaceMarks, type FaceParts } from '../face/scan';
import type { ShapeField } from '../face/shape';
import { FUN_EFFECTS } from './effects/index';
import { readFace } from './kit';
import type { FunPiece, FunSource } from './types';

type Point = readonly [number, number];
type Lookup = (u: number, v: number) => readonly [number, number];

/** The field of every effect of every face, or null when none moves anything. */
export function funFieldFrom({ shapes, faces, w, h }: FunSource): ShapeField | null {
  const long = Math.max(w, h);
  const kx = w / long;
  const ky = h / long;
  const asks = shapes.flatMap((shape) => {
    const face = faceAt(faces, shape.at);
    return face ? [{ face, values: shape.values }] : [];
  });
  const stages: ShapeField[] = [];
  for (const effect of FUN_EFFECTS) {
    const pieces: FunPiece[] = [];
    for (const { face, values } of asks) {
      const value = values[effect.id];
      if (!(value > 0)) continue;
      // The face as the effects before this one left it.
      const shown = stages.length ? faceThrough(face, chain(stages).offset) : face;
      const read = readFace(shown, kx, ky);
      if (!read) continue;
      pieces.push(...effect.pieces(read, Math.min(100, value) / 100));
    }
    if (!pieces.length) continue;
    const field = fieldOf(pieces, kx, ky);
    // Nothing of Brincar slides lips over teeth.
    stages.push({ offset: field.offset, alone: field.alone, area: field.area });
  }
  if (!stages.length) return null;
  return chain(stages);
}

/**
 * Stages one after the other: the first bends the photo, the next bends what the first showed, and so on. A point
 * shown goes back through the last stage first. The body goes through each stage but for the share of it that
 * moves a head alone, so the share of the whole is where the head is read against where the body is.
 */
function chain(stages: readonly ShapeField[]): ShapeField {
  if (stages.length === 1) return stages[0];
  const area = { u0: 1, v0: 1, u1: 0, v1: 0 };
  for (const s of stages) {
    area.u0 = Math.min(area.u0, s.area.u0);
    area.v0 = Math.min(area.v0, s.area.v0);
    area.u1 = Math.max(area.u1, s.area.u1);
    area.v1 = Math.max(area.v1, s.area.v1);
  }
  const offset = (u: number, v: number): [number, number] => {
    let a = u;
    let b = v;
    for (let i = stages.length - 1; i >= 0; i--) {
      const [du, dv] = stages[i].offset(a, b);
      a += du;
      b += dv;
    }
    return [a - u, b - v];
  };
  const layered = stages.some((s) => s.alone);
  return {
    area,
    offset,
    alone: layered
      ? (u, v) => {
          const [hu, hv] = offset(u, v);
          let a = u;
          let b = v;
          for (let i = stages.length - 1; i >= 0; i--) {
            const s = stages[i];
            const [du, dv] = s.offset(a, b);
            const [au, av] = s.alone ? s.alone(a, b) : [0, 0];
            a += du - au;
            b += dv - av;
          }
          return [u + hu - a, v + hv - b];
        }
      : undefined,
  };
}

/**
 * The point that shows `p` of the photo, through a field: the `q` with `q + D(q) = p`, by Newton's way. A field of
 * Brincar never folds, so there is one, and a few steps find it.
 */
export function shownThrough(p: Point, lookup: Lookup): [number, number] {
  const e = 1e-5;
  const [d0u, d0v] = lookup(p[0], p[1]);
  let qu = p[0] - d0u;
  let qv = p[1] - d0v;
  for (let i = 0; i < 10; i++) {
    const [du, dv] = lookup(qu, qv);
    const ru = qu + du - p[0];
    const rv = qv + dv - p[1];
    if (Math.abs(ru) < 1e-9 && Math.abs(rv) < 1e-9) break;
    const [au, av] = lookup(qu + e, qv);
    const [bu, bv] = lookup(qu, qv + e);
    // The derivative of q + D(q).
    const j00 = 1 + (au - du) / e;
    const j10 = (av - dv) / e;
    const j01 = (bu - du) / e;
    const j11 = 1 + (bv - dv) / e;
    const det = j00 * j11 - j01 * j10;
    if (!(Math.abs(det) > 1e-12)) break;
    qu -= (j11 * ru - j01 * rv) / det;
    qv -= (-j10 * ru + j00 * rv) / det;
  }
  return [qu, qv];
}

/** A face where it shows through a field: every landmark goes where the field shows it. */
function faceThrough(face: Face, lookup: Lookup): Face {
  const one = (p: Point) => shownThrough(p, lookup);
  const many = (list: readonly Point[]) => list.map(one);
  const parts: FaceParts = face.parts;
  const marks: FaceMarks | undefined = parts.marks && {
    jawCorners: many(parts.marks.jawCorners),
    cheekbones: many(parts.marks.cheekbones),
    temples: many(parts.marks.temples),
    noseWings: many(parts.marks.noseWings),
    bridge: one(parts.marks.bridge),
    bridgeMiddle: one(parts.marks.bridgeMiddle),
    noseTip: one(parts.marks.noseTip),
    noseBase: one(parts.marks.noseBase),
  };
  const shown = makeFace(many(face.outline), {
    eyes: parts.eyes.map(many),
    irises: parts.irises.map(many),
    innerLips: many(parts.innerLips),
    outerLips: many(parts.outerLips),
    brows: parts.brows?.map(many),
    midline: parts.midline && many(parts.midline),
    nostrils: parts.nostrils?.map(many),
    cheeks: parts.cheeks?.map(many),
    hollows: parts.hollows?.map(many),
    noseSides: parts.noseSides?.map(many),
    cheekTops: parts.cheekTops?.map(many),
    marks,
  });
  return face.chin ? { ...shown, chin: face.chin } : shown;
}
