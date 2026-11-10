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

import { faceAt } from '../face/reshape';
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
  const stages: Stage[] = [];
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
    if (pieces.length) stages.push(stageOf(pieces, kx, ky));
  }
  if (!stages.length) return null;
  return chain(stages);
}

/** Of the way to the edge of the photo, the share a point may read, as in `fieldOf` of `core/face/reshape.ts`. */
const EDGE_ROOM = 0.6;

/**
 * One effect on every face: what its pieces add up to at a point, and the share of that which moves a head
 * alone, in one go. Toward an edge the read stops short of it, as `fieldOf` does, so what touches the edge
 * stretches and leaves no streaks.
 */
interface Stage {
  area: ShapeField['area'];
  layered: boolean;
  /** Writes the move and, when `share`, the share of it that moves a head alone, in UV, into `out`. */
  at(u: number, v: number, out: Float64Array, share: boolean): void;
}

function stageOf(pieces: readonly FunPiece[], kx: number, ky: number): Stage {
  const area = { u0: 1, v0: 1, u1: 0, v1: 0 };
  for (const p of pieces) {
    area.u0 = Math.min(area.u0, (p.x - p.reach) / kx);
    area.v0 = Math.min(area.v0, (p.y - p.reach) / ky);
    area.u1 = Math.max(area.u1, (p.x + p.reach) / kx);
    area.v1 = Math.max(area.v1, (p.y + p.reach) / ky);
  }
  const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
  const short = (move: number, at: number, side: number) => (move < 0 ? Math.max(move, -at * EDGE_ROOM) : Math.min(move, (side - at) * EDGE_ROOM));
  const part: [number, number] = [0, 0];
  return {
    area: { u0: clamp01(area.u0), v0: clamp01(area.v0), u1: clamp01(area.u1), v1: clamp01(area.v1) },
    layered: pieces.some((p) => p.alone),
    at(u, v, out, share) {
      const x = u * kx;
      const y = v * ky;
      let sx = 0;
      let sy = 0;
      let ax = 0;
      let ay = 0;
      for (const p of pieces) {
        if (Math.abs(x - p.x) > p.reach || Math.abs(y - p.y) > p.reach) continue;
        part[0] = 0;
        part[1] = 0;
        p.add(x, y, part);
        if (part[0] === 0 && part[1] === 0) continue;
        sx += part[0];
        sy += part[1];
        if (share && p.alone) {
          const k = p.alone(x, y);
          ax += part[0] * k;
          ay += part[1] * k;
        }
      }
      if (sx === 0 && sy === 0) {
        out[0] = out[1] = out[2] = out[3] = 0;
        return;
      }
      const cx = short(sx, x, kx);
      const cy = short(sy, y, ky);
      out[0] = cx / kx;
      out[1] = cy / ky;
      // Cut short by as much as the whole was, so the body never reads past where the head does.
      out[2] = ax === 0 ? 0 : (ax * (sx === 0 ? 1 : cx / sx)) / kx;
      out[3] = ay === 0 ? 0 : (ay * (sy === 0 ? 1 : cy / sy)) / ky;
    },
  };
}

/**
 * Stages one after the other: the first bends the photo, the next bends what the first showed, and so on. A point
 * shown goes back through the last stage first. The body goes through each stage but for the share of it that
 * moves a head alone, so the share of the whole is where the head is read against where the body is. Until a
 * stage parts them, head and body are read at the same point, once.
 */
function chain(stages: readonly Stage[]): ShapeField {
  const area = { u0: 1, v0: 1, u1: 0, v1: 0 };
  for (const s of stages) {
    area.u0 = Math.min(area.u0, s.area.u0);
    area.v0 = Math.min(area.v0, s.area.v0);
    area.u1 = Math.max(area.u1, s.area.u1);
    area.v1 = Math.max(area.v1, s.area.v1);
  }
  const buf = new Float64Array(4);
  const offset = (u: number, v: number): [number, number] => {
    let a = u;
    let b = v;
    for (let i = stages.length - 1; i >= 0; i--) {
      stages[i].at(a, b, buf, false);
      a += buf[0];
      b += buf[1];
    }
    return [a - u, b - v];
  };
  return {
    area,
    offset,
    alone: stages.some((s) => s.layered)
      ? (u, v) => {
          let a = u;
          let b = v;
          let c = u;
          let d = v;
          let apart = false;
          for (let i = stages.length - 1; i >= 0; i--) {
            const s = stages[i];
            s.at(a, b, buf, true);
            a += buf[0];
            b += buf[1];
            if (!apart) {
              c += buf[0] - buf[2];
              d += buf[1] - buf[3];
              apart = buf[2] !== 0 || buf[3] !== 0;
            } else {
              s.at(c, d, buf, true);
              c += buf[0] - buf[2];
              d += buf[1] - buf[3];
            }
          }
          return [a - c, b - d];
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
