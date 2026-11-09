/**
 * Completes a plate with an inpainting model: the photo as it would be with nobody standing in front of it.
 * Plain arrays, and the model comes in as a function, so the plan and the bookkeeping can be tested alone.
 *
 * A warp only ever shows a band of the plate, next to the edge of what moved, so only that band is asked of
 * the model. The rest of what a person covers keeps the smooth guess of the quick plate, which the model sees
 * as if it were photo. That keeps the hole narrow, and a narrow hole is what such a model fills well: it carries
 * on the fold of a pillow or the grain of asphalt from the pixels right next to it.
 *
 * The band is worked through in overlapping square tiles, at the size the model was trained on. Where tiles
 * overlap, each one counts for more the farther a pixel is from its side, so no line shows where they meet.
 */

import type { Area } from './mask';
import { blurKnown, nearestCells, spreadKnown } from './plate';

/** Side of a tile, in cells: the size the model works at. */
export const FILL_TILE = 512;
/** Tiles overlap by twice this, and a tile counts in full only this far from its sides, unless the side is the side of the plate. */
const TILE_MARGIN = 72;
/** The band is this share of the size of a face, from the edge of what moves inward. */
export const BAND_SHARE = 0.36;
/** A face larger than this many cells is worked at a smaller scale, so the band stays narrow next to a tile. */
export const FILL_FACE = 520;
/**
 * The band is filled in rings of this many cells, from the photo inward, and each ring counts as photo for the
 * next. Asked for a wide hole at once, the model makes things up to put in it: a shape that looks like an
 * object, on a plain wall. Asked for a narrow ring, it carries on what is right next to it.
 */
const RING = 44;

/** Fills the unknown cells of one tile. `rgb` holds the planes of red, green and blue, and `known` is 255 where the tile is photo. */
export type Inpaint = (rgb: Uint8Array, known: Uint8Array, w: number, h: number) => Promise<Uint8Array>;

/** A plan for one run of tiles: where the model is asked for a pixel, and the tiles that cover it. */
export interface FillPlan {
  /** 1 where the model is asked for a pixel. */
  hole: Uint8Array;
  tiles: Area[];
}

/** For each cell, how far the nearest set cell of `mask` is, in cells. Infinity when none is set. */
export function distanceTo(mask: Uint8Array, w: number, h: number): Float32Array {
  const near = nearestCells(mask, w, h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const at = y * w + x;
      const from = near[at];
      if (from < 0) {
        out[at] = Infinity;
        continue;
      }
      const fx = from % w;
      out[at] = Math.hypot(fx - x, (from - fx) / w - y);
    }
  }
  return out;
}

/** The tiles that cover a hole. A tile with no hole in its middle is left out. */
export function planFill(hole: Uint8Array, w: number, h: number): FillPlan {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!hole[y * w + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  const tiles: Area[] = [];
  if (x1 < 0) return { hole, tiles };
  const tw = Math.min(FILL_TILE, w);
  const th = Math.min(FILL_TILE, h);
  const stepX = Math.max(1, tw - 2 * TILE_MARGIN);
  const stepY = Math.max(1, th - 2 * TILE_MARGIN);
  // The first tile keeps its margin outside the hole, and each next one starts where the middle of the last one ended.
  const starts = (from: number, to: number, side: number, step: number, limit: number): number[] => {
    const list: number[] = [];
    let at = Math.max(0, Math.min(limit - side, from - TILE_MARGIN));
    for (;;) {
      list.push(at);
      const last = at + side >= limit;
      if (last || at + side - TILE_MARGIN > to) break;
      at = Math.min(limit - side, at + step);
    }
    return list;
  };
  for (const ty of starts(y0, y1, th, stepY, h)) {
    for (const tx of starts(x0, x1, tw, stepX, w)) {
      const kept = keptPart({ x: tx, y: ty, w: tw, h: th }, w, h);
      let any = false;
      for (let y = kept.y; y < kept.y + kept.h && !any; y++) {
        for (let x = kept.x; x < kept.x + kept.w; x++) {
          if (hole[y * w + x]) {
            any = true;
            break;
          }
        }
      }
      if (any) tiles.push({ x: tx, y: ty, w: tw, h: th });
    }
  }
  return { hole, tiles };
}

/** The middle of a tile: where it counts in full. */
export function keptPart(tile: Area, w: number, h: number): Area {
  const left = tile.x > 0 ? TILE_MARGIN : 0;
  const top = tile.y > 0 ? TILE_MARGIN : 0;
  const right = tile.x + tile.w < w ? TILE_MARGIN : 0;
  const bottom = tile.y + tile.h < h ? TILE_MARGIN : 0;
  return { x: tile.x + left, y: tile.y + top, w: tile.w - left - right, h: tile.h - top - bottom };
}

export interface FillEvents {
  /** A tile is done, of this many. */
  tile(done: number, total: number): void;
  stopped(): boolean;
}

/**
 * Runs the plan over a plate, in place. `plate` is RGBA on a grid of `w` by `h`: photo where nothing covers it,
 * and the smooth guess elsewhere. Only the color of hole cells changes, and only once every tile is done. False
 * when stopped halfway, and then the plate is as it was.
 */
export async function runFill(plate: Uint8Array, plan: FillPlan, w: number, h: number, inpaint: Inpaint, events: FillEvents): Promise<boolean> {
  const { hole } = plan;
  const sum = new Float32Array(w * h * 3);
  const weight = new Float32Array(w * h);
  for (const [i, tile] of plan.tiles.entries()) {
    if (events.stopped()) return false;
    const size = tile.w * tile.h;
    const rgb = new Uint8Array(size * 3);
    const known = new Uint8Array(size);
    for (let y = 0; y < tile.h; y++) {
      for (let x = 0; x < tile.w; x++) {
        const from = (tile.y + y) * w + tile.x + x;
        const to = y * tile.w + x;
        rgb[to] = plate[from * 4];
        rgb[size + to] = plate[from * 4 + 1];
        rgb[2 * size + to] = plate[from * 4 + 2];
        known[to] = hole[from] ? 0 : 255;
      }
    }
    const filled = await inpaint(rgb, known, tile.w, tile.h);
    if (events.stopped()) return false;
    const kept = keptPart(tile, w, h);
    // From nothing at a side of the tile to all of it where the middle starts.
    const ramp = (at: number, from: number, to: number, start: number, end: number) => {
      const before = from > start ? (at + 0.5 - start) / (from - start) : 1;
      const after = to < end ? (end - at - 0.5) / (end - to) : 1;
      return Math.max(0, Math.min(1, before, after));
    };
    for (let y = tile.y; y < tile.y + tile.h; y++) {
      const ky = ramp(y, kept.y, kept.y + kept.h, tile.y, tile.y + tile.h);
      for (let x = tile.x; x < tile.x + tile.w; x++) {
        const at = y * w + x;
        if (!hole[at]) continue;
        const k = ky * ramp(x, kept.x, kept.x + kept.w, tile.x, tile.x + tile.w);
        if (k <= 0) continue;
        const from = (y - tile.y) * tile.w + x - tile.x;
        sum[at * 3] += filled[from] * k;
        sum[at * 3 + 1] += filled[size + from] * k;
        sum[at * 3 + 2] += filled[2 * size + from] * k;
        weight[at] += k;
      }
    }
    events.tile(i + 1, plan.tiles.length);
  }
  for (let at = 0; at < weight.length; at++) {
    if (weight[at] <= 0) continue;
    for (let c = 0; c < 3; c++) plate[at * 4 + c] = Math.max(0, Math.min(255, Math.round(sum[at * 3 + c] / weight[at])));
  }
  return true;
}

/** A plate at a smaller size, for a face too large for a tile. Averages the cells each new one covers. */
export function shrinkPlate(plate: Uint8Array, w: number, h: number, sw: number, sh: number): Uint8Array {
  const out = new Uint8Array(sw * sh * 4);
  for (let y = 0; y < sh; y++) {
    const y0 = Math.floor((y * h) / sh);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * h) / sh));
    for (let x = 0; x < sw; x++) {
      const x0 = Math.floor((x * w) / sw);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * w) / sw));
      const sum = [0, 0, 0, 0];
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const at = (yy * w + xx) * 4;
          for (let c = 0; c < 4; c++) sum[c] += plate[at + c];
        }
      }
      const count = (y1 - y0) * (x1 - x0);
      const to = (y * sw + x) * 4;
      // Alpha says where the plate is a guess: one covered cell makes the small one covered.
      for (let c = 0; c < 3; c++) out[to + c] = Math.round(sum[c] / count);
      out[to + 3] = sum[3] > 0 ? 255 : 0;
    }
  }
  return out;
}

/** The fine texture of a quick plate is kept within this many levels: more than that is an edge, not texture. */
const FINE_LIMIT = 18;

/**
 * Brings the answer of a smaller plate back into the full one, in place: where `hole` is set, the color of the
 * small plate, read between its cells, plus the fine texture the full plate already had there. The texture is
 * what a smooth read between cells cannot give, and the quick plate took it from the photo next to the hole.
 * It is what the quick plate has over its own blur, counted among covered cells only, so the edge where the
 * guess meets the photo leaves no line.
 */
export function growFill(plate: Uint8Array, hole: Uint8Array, w: number, h: number, small: Uint8Array, sw: number, sh: number): void {
  const n = w * h;
  const color = new Float32Array(n * 3);
  const covered = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    covered[i] = plate[i * 4 + 3] > 0 ? 1 : 0;
    for (let c = 0; c < 3; c++) color[i * 3 + c] = plate[i * 4 + c];
  }
  const soft = blurKnown(color, covered, w, h, Math.max(1, Math.round(w / sw)));
  const read = (from: Uint8Array, gx: number, gy: number, c: number) => {
    const x = Math.min(sw - 1, Math.max(0, gx));
    const y = Math.min(sh - 1, Math.max(0, gy));
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(sw - 1, x0 + 1);
    const y1 = Math.min(sh - 1, y0 + 1);
    const tx = x - x0;
    const ty = y - y0;
    const a = from[(y0 * sw + x0) * 4 + c];
    const b = from[(y0 * sw + x1) * 4 + c];
    const d = from[(y1 * sw + x0) * 4 + c];
    const e = from[(y1 * sw + x1) * 4 + c];
    return (a + (b - a) * tx) * (1 - ty) + (d + (e - d) * tx) * ty;
  };
  for (let y = 0; y < h; y++) {
    const gy = ((y + 0.5) * sh) / h - 0.5;
    for (let x = 0; x < w; x++) {
      const at = y * w + x;
      if (!hole[at]) continue;
      const gx = ((x + 0.5) * sw) / w - 0.5;
      for (let c = 0; c < 3; c++) {
        const fine = Math.max(-FINE_LIMIT, Math.min(FINE_LIMIT, color[at * 3 + c] - soft[at * 3 + c]));
        plate[at * 4 + c] = Math.max(0, Math.min(255, Math.round(read(small, gx, gy, c) + fine)));
      }
    }
  }
}

/** The two plates of a photo, as the quick guess left them, on a grid of `w` by `h`. */
export interface PlateSet {
  w: number;
  h: number;
  /** A length that goes with the size of the heads, in cells. See `headSpan`. */
  span: number;
  /** The photo with nobody in it. Alpha says where it is a guess. */
  back: Uint8Array;
  /** The photo with no head in it. */
  head: Uint8Array;
  /** The mattes the plates were made from. */
  personMatte: Uint8Array;
  headMatte: Uint8Array;
}

export interface CompleteEvents {
  /** A tile is done, of this many. */
  tile(done: number, total: number): void;
  /** A plate is finished, at full size. */
  plate(which: 'back' | 'head', data: Uint8Array): void;
  stopped(): boolean;
}

/** The span of the heads is about this many times the size of a face. */
const SPAN_PER_FACE = 1.3;
/** A matte above this is its layer for sure, and one at or below `TRACE` holds none of it. As in `plate.ts`. */
const SOLID = 127;
const TRACE = 8;

/** A matte at a smaller size: the average of the cells each new one covers. */
function shrinkMatte(matte: Uint8Array, w: number, h: number, sw: number, sh: number): Uint8Array {
  const out = new Uint8Array(sw * sh);
  for (let y = 0; y < sh; y++) {
    const y0 = Math.floor((y * h) / sh);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * h) / sh));
    for (let x = 0; x < sw; x++) {
      const x0 = Math.floor((x * w) / sw);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * w) / sw));
      let sum = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) sum += matte[yy * w + xx];
      out[y * sw + x] = Math.round(sum / ((y1 - y0) * (x1 - x0)));
    }
  }
  return out;
}

/** A plate covers at most this many cells of background around its layer. See `ROOM_SHARE` in `plate.ts`. */
const RIM_CELLS = 8;
/** A part of the person with no head on it is body when it is wider than twice this share of the face size. */
const BODY_WIDE = 0.05;
/** Where background and body are about as near, the plate of the head goes from one to the other over this many cells. */
const SEAM = 5;

/** The rings of a hole, from the photo inward. `reach` is how far each cell is from the photo. */
function ringsOf(hole: Uint8Array, reach: Float32Array, w: number, h: number): FillPlan[] {
  let deepest = 0;
  for (let i = 0; i < hole.length; i++) if (hole[i] && reach[i] > deepest) deepest = reach[i];
  const count = Math.max(1, Math.ceil(deepest / RING));
  const plans: FillPlan[] = [];
  for (let r = 0; r < count; r++) {
    const ring = new Uint8Array(hole.length);
    let any = false;
    for (let i = 0; i < hole.length; i++) {
      if (!hole[i] || Math.min(count - 1, Math.floor(Math.max(0, reach[i] - 1e-3) / RING)) !== r) continue;
      ring[i] = 1;
      any = true;
    }
    if (any) plans.push(planFill(ring, w, h));
  }
  return plans;
}

function coveredOf(plate: Uint8Array): Uint8Array {
  const covered = new Uint8Array(plate.length / 4);
  for (let i = 0; i < covered.length; i++) covered[i] = plate[i * 4 + 3] > 0 ? 1 : 0;
  return covered;
}

const smoothStep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Finishes both plates with the model. False when stopped halfway.
 *
 * Behind a head there is background or body, and each is carried on from its own kind only. The background
 * comes from the plate with nobody in it, where the model never saw the person. The body comes from a second
 * run that sees nothing but the body, so a neck goes on up under a jaw as neck. Each cell of the plate of the
 * head then takes the one whose photo is nearer: where a jaw hid neck, neck shows, and where it hid a pillow,
 * the pillow does.
 */
export async function completePlates(plates: PlateSet, inpaint: Inpaint, events: CompleteEvents): Promise<boolean> {
  const { w, h } = plates;
  const face = plates.span / SPAN_PER_FACE;
  const scale = Math.min(1, FILL_FACE / Math.max(face, 1));
  const sw = Math.max(1, Math.round(w * scale));
  const sh = Math.max(1, Math.round(h * scale));
  const small = scale < 1;
  const back = small ? shrinkPlate(plates.back, w, h, sw, sh) : plates.back.slice();
  const head = small ? shrinkPlate(plates.head, w, h, sw, sh) : plates.head.slice();
  const personMatte = small ? shrinkMatte(plates.personMatte, w, h, sw, sh) : plates.personMatte;
  const headMatte = small ? shrinkMatte(plates.headMatte, w, h, sw, sh) : plates.headMatte;
  const n = sw * sh;
  const band = Math.max(6, face * scale * BAND_SHARE);
  const coveredBack = coveredOf(back);
  const coveredHead = coveredOf(head);
  // What the model is shown as background is what no plate covers. Where the background really is goes
  // further: the ground around hair that a plate clears is background too, with nothing of the person on it.
  const isBack = new Uint8Array(n);
  const backIsHere = new Uint8Array(n);
  const isBody = new Uint8Array(n);
  const bodyIsHere = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    isBack[i] = coveredBack[i] ? 0 : 1;
    backIsHere[i] = personMatte[i] <= TRACE ? 1 : 0;
  }
  const toShown = distanceTo(isBack, sw, sh);
  const toBack = distanceTo(backIsHere, sw, sh);
  // Body is the person with no head on it. Where the head only fades out over the body, as its shadow on a
  // neck, that is still where the body is, though the model is not shown it: the shadow must not be carried on.
  // A few cells next to the background are left out, for what the edge of the matte may have missed.
  const rim = RIM_CELLS * scale + 1;
  const notBody = new Uint8Array(n);
  for (let i = 0; i < n; i++) notBody[i] = personMatte[i] > SOLID && headMatte[i] <= SOLID && toBack[i] > rim ? 0 : 1;
  // A body is a wide thing. An earring, or a sliver where the two mattes disagree, is a few cells of person
  // with no head on them, and carried on as if it were a neck it would paint a dark shape behind the head.
  const wide = Math.max(3, face * scale * BODY_WIDE);
  const depth = distanceTo(notBody, sw, sh);
  const core = new Uint8Array(n);
  for (let i = 0; i < n; i++) core[i] = !notBody[i] && depth[i] > wide ? 1 : 0;
  const toCore = distanceTo(core, sw, sh);
  for (let i = 0; i < n; i++) {
    bodyIsHere[i] = !notBody[i] && toCore[i] <= wide + 2 ? 1 : 0;
    isBody[i] = bodyIsHere[i] && !coveredHead[i] ? 1 : 0;
  }
  const toBody = distanceTo(bodyIsHere, sw, sh);
  const toSeen = distanceTo(isBody, sw, sh);
  const holeBack = new Uint8Array(n);
  const holeBody = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (coveredBack[i] && toShown[i] <= band) holeBack[i] = 1;
    if (coveredHead[i] && toBody[i] <= band && toBody[i] <= toBack[i] + SEAM) holeBody[i] = 1;
  }
  const plansBack = ringsOf(holeBack, toShown, sw, sh);
  const plansBody = ringsOf(holeBody, toSeen, sw, sh);
  const total = [...plansBack, ...plansBody].reduce((sum, plan) => sum + plan.tiles.length, 0);
  let done = 0;
  const count = { tile: () => events.tile(++done, total), stopped: events.stopped };
  for (const plan of plansBack) if (!(await runFill(back, plan, sw, sh, inpaint, count))) return false;
  // The body alone, with the smooth guess of its own colors everywhere else, for the model to carry on from.
  const body = spreadKnown(head, isBody, sw, sh);
  for (const plan of plansBody) if (!(await runFill(body, plan, sw, sh, inpaint, count))) return false;
  const holeHead = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!coveredHead[i] || !(holeBack[i] || holeBody[i])) continue;
    const share = !holeBody[i] ? 0 : !holeBack[i] ? 1 : smoothStep(-SEAM, SEAM, toBack[i] - toBody[i]);
    for (let c = 0; c < 3; c++) head[i * 4 + c] = Math.round(back[i * 4 + c] + (body[i * 4 + c] - back[i * 4 + c]) * share);
    holeHead[i] = 1;
  }
  const finish = (which: 'back' | 'head', full: Uint8Array, work: Uint8Array, hole: Uint8Array) => {
    if (!small) {
      events.plate(which, work);
      return;
    }
    const out = full.slice();
    // Every cell of the full plate that falls on a cell the model filled.
    const wide = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const sy = Math.min(sh - 1, Math.floor((y * sh) / h));
      for (let x = 0; x < w; x++) wide[y * w + x] = out[(y * w + x) * 4 + 3] > 0 ? hole[sy * sw + Math.min(sw - 1, Math.floor((x * sw) / w))] : 0;
    }
    growFill(out, wide, w, h, work, sw, sh);
    events.plate(which, out);
  };
  finish('head', plates.head, head, holeHead);
  finish('back', plates.back, back, holeBack);
  return true;
}
