/**
 * Works out which pixels of a photo belong to a person and which to the background, for the warps of the
 * face menu. Plain arrays and no browser APIs, so every step can be tested: the models come in as functions.
 *
 * The segmenter sees its input at 256 px, which on a whole photo means a coarse edge. So it looks at the
 * whole photo once, to catch bodies and people with no face found, and again at a square around each head,
 * where the edge is what matters. The hair segmenter adds the strands the first one leaves out, the outline
 * of the face is a person whatever the models say, and the photo itself refines the edge at the end.
 *
 * The result is the matte: 0 is background for sure, and that is the promise the lock keeps.
 */

import { faceSize, sampleCut, type HairCut } from './hair';
import { boxBlur, fillPolygon, guidedFilter, type Area, type MaskTarget } from './mask';
import { CHIN, type Face } from './scan';

/** Side of the square around a head, as a multiple of the face size. Takes in the hair and the shoulders. */
const CROP_SPAN = 3.4;
/** The square sits this much of the face size below the middle of the face, for the neck. */
const CROP_DROP = 0.35;
/** Across this share of a crop, its answer gives way to that of the whole photo. */
const CROP_BLEND = 0.12;
/**
 * Confidence below the first is background, above the second it is a person. High, because this model gives
 * 0.5 to 0.7 to a pillow or a car seat touching the head, and close to 1 to the person.
 */
const SURE_LOW = 0.72;
const SURE_HIGH = 0.92;
/** Hair is asked to be surer than that: this model also likes dark things around a head. */
const HAIR_LOW = 0.45;
const HAIR_HIGH = 0.8;
/**
 * Above the chin a person is a head: the face, the ears and the hair. Past this share of the face size around
 * the outline, and this share around the hair, what the model sees there is the pillow or the seat behind it.
 */
const EAR_ROOM = 0.15;
const HAIR_ROOM = 0.035;
/** Hair at this confidence counts for that limit. */
const HAIR_SEEN = 0.25;
/**
 * Between these heights, with the top of the outline at 0 and the chin at 1, the limit gives way to the body.
 * High up, because in a selfie the shoulders rise to the level of the mouth.
 */
const BODY_FROM = 0.68;
const BODY_UNTIL = 0.88;
/** Around the hair, loose strands: how far from it they are looked for, as a share of the face size. */
const STRAND_ROOM = 0.16;
/** Half the width of what counts as wide, as a share of the face size. */
const STRAND_WIDTH = 0.012;
/** A strand is at least this share of a pixel, and this much more to count in full. */
const STRAND_FAINT = 0.06;
const STRAND_SPAN = 0.16;
/** The share of the background around the hair taken as how much it reads like hair by itself. */
const STRAND_USUAL = 0.95;
/** Hair at this confidence says where strands may be. */
const STRAND_SEEN = 0.2;
/** Width of the doubtful band along the edge, as shares of the face size, for each round of the colors. */
const EDGE_BANDS = [0.03, 0.014];
/** The colors nearby are read over this many widths of the band. */
const EDGE_NEARBY = 2.5;
/** Two sides this far apart in color, on 0..1, say where the edge is. Closer than the first, they say nothing. */
const COLOR_LOW = 0.05;
const COLOR_HIGH = 0.18;
/** The refined edge may not go past where the segmenter gives this confidence, as a soft limit. */
const REACH_LOW = 0.45;
const REACH_HIGH = 0.72;
/** Reach of the refinement, as a share of the face size, and at least a pixel. */
const REFINE_RADIUS = 0.012;
const REFINE_EPS = 0.0015;
/** Below this, out of 1, a pixel is background for sure. Above the second, a person for sure. */
const SNAP_LOW = 0.06;
const SNAP_HIGH = 0.94;
/** Side of the grid that looks for what touches a face. Plenty for telling a body from a blob. */
const PARTS_SIDE = 384;
/** A cell above this is part of the person, when looking for what touches a face. */
const PARTS_LEVEL = 96;
/** A hole in the middle of a person smaller than this share of the photo is filled. */
const MAX_HOLE = 0.01;
/** A matte with less than this share of the photo found no person at all. */
const MIN_PERSON = 0.002;
/** Size given to the refinement when the photo has no face to measure. */
const NO_FACE_SIZE = 0.3;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function smooth(v: number, lo: number, hi: number): number {
  const t = clamp((v - lo) / (hi - lo), 0, 1);
  return t * t * (3 - 2 * t);
}

/** The square around one head, in pixels of a photo of `w` by `h`. It slides inside the photo near an edge. */
export function headCrop(box: Area, w: number, h: number): Area {
  const size = faceSize(box, w, h);
  const side = size * CROP_SPAN;
  const sw = Math.min(side, w);
  const sh = Math.min(side, h);
  const cx = (box.x + box.w / 2) * w;
  const cy = (box.y + box.h / 2) * h + size * CROP_DROP;
  const x = Math.round(clamp(cx - sw / 2, 0, w - sw));
  const y = Math.round(clamp(cy - sh / 2, 0, h - sh));
  return { x, y, w: Math.min(w - x, Math.round(sw)), h: Math.min(h - y, Math.round(sh)) };
}

/** How much a crop counts at a point: all of it inside, fading out toward each side that is not the side of the photo. */
function cropWeight(fx: number, fy: number, area: Area, w: number, h: number): number {
  let k = 1;
  if (area.x > 0) k = Math.min(k, fx / CROP_BLEND);
  if (area.y > 0) k = Math.min(k, fy / CROP_BLEND);
  if (area.x + area.w < w) k = Math.min(k, (1 - fx) / CROP_BLEND);
  if (area.y + area.h < h) k = Math.min(k, (1 - fy) / CROP_BLEND);
  return smooth(k, 0, 1);
}

/** Calls the models, so this file does not depend on them. Areas are in pixels of the photo. */
export interface PersonModels {
  person(area: Area): HairCut;
  hair(area: Area): HairCut;
}

/** What the models say about each cell, from 0 to 1. */
export interface PersonSeen {
  person: Float32Array;
  hair: Float32Array;
}

/** The confidence that each cell of `target` is a person, before the photo refines it. Null when stopped. */
export async function personConfidence(
  size: { w: number; h: number },
  target: { w: number; h: number },
  faces: readonly Face[],
  models: PersonModels,
  pause: () => Promise<void>,
  report: (fraction: number) => void,
  stopped: () => boolean,
): Promise<PersonSeen | null> {
  const { w, h } = target;
  const out = new Float32Array(w * h);
  const whole = models.person({ x: 0, y: 0, w: size.w, h: size.h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) out[y * w + x] = sampleCut(whole, (x + 0.5) / w, (y + 0.5) / h);
  }
  report(1 / (faces.length + 1));
  const kx = w / size.w;
  const ky = h / size.h;
  const seen = new Float32Array(w * h);
  const heads = new Float32Array(w * h);
  const strands = new Float32Array(w * h);
  for (const [i, face] of faces.entries()) {
    await pause();
    if (stopped()) return null;
    const area = headCrop(face.box, size.w, size.h);
    const body = models.person(area);
    const hair = models.hair(area);
    const x0 = Math.max(0, Math.floor(area.x * kx));
    const y0 = Math.max(0, Math.floor(area.y * ky));
    const x1 = Math.min(w, Math.ceil((area.x + area.w) * kx));
    const y1 = Math.min(h, Math.ceil((area.y + area.h) * ky));
    for (let y = y0; y < y1; y++) {
      const fy = ((y + 0.5) / ky - area.y) / area.h;
      for (let x = x0; x < x1; x++) {
        const fx = ((x + 0.5) / kx - area.x) / area.w;
        const k = cropWeight(fx, fy, area, size.w, size.h);
        if (k <= 0) continue;
        const b = sampleCut(body, fx, fy);
        const strand = sampleCut(hair, fx, fy);
        const c = Math.max(b, smooth(strand, HAIR_LOW, HAIR_HIGH));
        const at = y * w + x;
        if (strand > strands[at]) strands[at] = strand;
        // Of two crops over a pixel, the surer one says.
        if (k > seen[at]) seen[at] = k;
        if (c > heads[at]) heads[at] = c;
      }
    }
    report((i + 2) / (faces.length + 1));
  }
  for (let i = 0; i < out.length; i++) out[i] += (heads[i] - out[i]) * seen[i];
  return { person: out, hair: strands };
}

/** Bits per channel of the tables of colors. */
const COLOR_BITS = 4;
/** A cell whose color is this much more common in the background than on the head is background. */
const LOOKS_BACK = 0.8;
/** Below this share of the sure background, a color says nothing about it. */
const BACK_SEEN = 0.002;

/** Share of the marked cells with each color, each counted with its neighbors, so noise does not split a color. */
function colorTable(rgba: ArrayLike<number>, n: number, marked: (i: number) => boolean): Float32Array {
  const side = 1 << COLOR_BITS;
  const shift = 8 - COLOR_BITS;
  const counts = new Float32Array(side ** 3);
  let total = 0;
  for (let i = 0; i < n; i++) {
    if (!marked(i)) continue;
    counts[(rgba[i * 4] >> shift << (2 * COLOR_BITS)) | (rgba[i * 4 + 1] >> shift << COLOR_BITS) | (rgba[i * 4 + 2] >> shift)]++;
    total++;
  }
  const out = new Float32Array(counts.length);
  if (!total) return out;
  for (let r = 0; r < side; r++) {
    for (let g = 0; g < side; g++) {
      for (let b = 0; b < side; b++) {
        const c = counts[(r << (2 * COLOR_BITS)) | (g << COLOR_BITS) | b];
        if (!c) continue;
        for (let dr = Math.max(0, r - 1); dr <= Math.min(side - 1, r + 1); dr++) {
          for (let dg = Math.max(0, g - 1); dg <= Math.min(side - 1, g + 1); dg++) {
            for (let db = Math.max(0, b - 1); db <= Math.min(side - 1, b + 1); db++) out[(dr << (2 * COLOR_BITS)) | (dg << COLOR_BITS) | db] += c / total;
          }
        }
      }
    }
  }
  return out;
}

/**
 * Where the body may be, the model is not always right either: next to a neck it can take in a whole piece of
 * pillow. A cell away from the head with a color seen all over the sure background, and not on the head, is
 * background. A white shirt on a white wall goes too, and it does no harm: nothing moves that far from a face.
 */
function dropWhatLooksLikeBackground(conf: Float32Array, rgba: ArrayLike<number>, head: Float32Array, n: number): void {
  const back = colorTable(rgba, n, (i) => conf[i] < 0.1);
  const front = colorTable(rgba, n, (i) => head[i] > 0.5 && conf[i] > 0.9);
  const shift = 8 - COLOR_BITS;
  for (let i = 0; i < n; i++) {
    if (head[i] > 0.5 || conf[i] < 0.1) continue;
    const at = (rgba[i * 4] >> shift << (2 * COLOR_BITS)) | (rgba[i * 4 + 1] >> shift << COLOR_BITS) | (rgba[i * 4 + 2] >> shift);
    if (back[at] > BACK_SEEN && back[at] / (back[at] + front[at] + 1e-6) > LOOKS_BACK) conf[i] = 0;
  }
}

/** How much each cell may be a person, by the shape of a head. See `EAR_ROOM`. */
function headLimit(faces: readonly Face[], ovals: readonly Float32Array[], hair: Float32Array, w: number, h: number): { limit: Float32Array; head: Float32Array } {
  const limit = new Float32Array(w * h);
  const head = new Float32Array(w * h);
  const seenHair = new Float32Array(w * h);
  for (let i = 0; i < hair.length; i++) seenHair[i] = hair[i] > HAIR_SEEN ? 1 : 0;
  for (const [n, face] of faces.entries()) {
    const size = faceSize(face.box, w, h);
    const around = grown(ovals[n], w, h, Math.round(size * EAR_ROOM));
    const hairRoom = grown(seenHair, w, h, Math.round(size * HAIR_ROOM));
    const top = face.outline[0];
    const chin = face.outline[CHIN];
    const ax = (chin[0] - top[0]) * w;
    const ay = (chin[1] - top[1]) * h;
    const a2 = ax * ax + ay * ay || 1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const t = ((x + 0.5 - top[0] * w) * ax + (y + 0.5 - top[1] * h) * ay) / a2;
        const at = y * w + x;
        const onHead = Math.max(around[at], hairRoom[at]);
        if (onHead > head[at]) head[at] = onHead;
        const v = Math.max(onHead, smooth(t, BODY_FROM, BODY_UNTIL));
        if (v > limit[at]) limit[at] = v;
      }
    }
  }
  return { limit, head };
}

/** A soft mask grown by about `r` cells. */
function grown(mask: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r < 1) return mask.slice();
  const blurred = boxBlur(boxBlur(mask, w, h, r), w, h, r);
  for (let i = 0; i < blurred.length; i++) blurred[i] = smooth(blurred[i], 0.01, 0.12);
  return blurred;
}

/**
 * Moves the edge to where the colors change. Inside a band along the edge, each cell is read as a mix of the
 * sure colors of the person and of the background close to it, so a white pillow gives way next to dark hair.
 * Where both sides have the same color the colors say nothing, and the edge stays as it was.
 */
export function followColors(shape: Float32Array, rgba: ArrayLike<number>, w: number, h: number, band: number): Float32Array {
  const n = w * h;
  const r = Math.max(1, Math.round(band));
  const inner = new Float32Array(n);
  const outer = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    inner[i] = shape[i] < 0.9 ? 1 : 0;
    outer[i] = shape[i] > 0.1 ? 1 : 0;
  }
  const notSureIn = boxBlur(inner, w, h, r);
  const notSureOut = boxBlur(outer, w, h, r);
  const far = Math.max(2, Math.round(band * EDGE_NEARBY));
  const sides = [new Float32Array(n), new Float32Array(n)];
  const channels: Float32Array[][] = [[], []];
  for (let i = 0; i < n; i++) {
    sides[0][i] = notSureIn[i] > 0 ? 0 : 1;
    sides[1][i] = notSureOut[i] > 0 ? 0 : 1;
  }
  for (const [k, side] of sides.entries()) {
    for (let c = 0; c < 3; c++) {
      const values = new Float32Array(n);
      for (let i = 0; i < n; i++) values[i] = (side[i] * rgba[i * 4 + c]) / 255;
      channels[k].push(boxBlur(values, w, h, far));
    }
  }
  const weightIn = boxBlur(sides[0], w, h, far);
  const weightOut = boxBlur(sides[1], w, h, far);
  const out = shape.slice();
  for (let i = 0; i < n; i++) {
    if (sides[0][i] || sides[1][i] || weightIn[i] <= 1e-4 || weightOut[i] <= 1e-4) continue;
    let along = 0;
    let span = 0;
    for (let c = 0; c < 3; c++) {
      const f = channels[0][c][i] / weightIn[i];
      const b = channels[1][c][i] / weightOut[i];
      along += ((rgba[i * 4 + c] / 255 - b) * (f - b));
      span += (f - b) * (f - b);
    }
    const trust = smooth(Math.sqrt(span), COLOR_LOW, COLOR_HIGH);
    if (trust <= 0) continue;
    const alpha = clamp(along / span, 0, 1);
    out[i] = shape[i] + (alpha - shape[i]) * trust;
  }
  return out;
}

/**
 * Loose strands around the hair, which the models miss. They are thin, so a strand is only a faint part of each
 * pixel, and on the matte it counts in full: it has to leave with the head, or it stays floating where the head
 * was. What the colors see over a wide area next to the hair is a dark seat or a shadow, and stays out.
 */
function looseStrands(shape: Float32Array, rgba: ArrayLike<number>, hair: Float32Array, w: number, h: number, size: number): Float32Array {
  const near = new Float32Array(w * h);
  for (let i = 0; i < near.length; i++) near[i] = hair[i] > STRAND_SEEN ? 1 : 0;
  const zone = grown(near, w, h, Math.round(size * STRAND_ROOM));
  const read = followColors(shape, rgba, w, h, size * STRAND_ROOM);
  // Texture also reads as a bit of hair: asphalt or a rug does it all over. What a strand must beat is what most
  // of the background around the hair reads.
  const around: number[] = [];
  for (let i = 0; i < zone.length; i += 3) if (zone[i] > 0.5 && shape[i] < 0.1) around.push(read[i]);
  around.sort((a, b) => a - b);
  const usual = around.length ? around[Math.floor(around.length * STRAND_USUAL)] : 0;
  const faint = Math.max(STRAND_FAINT, usual * 2);
  const clear = faint + STRAND_SPAN;
  const added = new Float32Array(w * h);
  for (let i = 0; i < zone.length; i++) added[i] = shape[i] > 0.5 ? 0 : smooth(read[i], faint, clear) * zone[i];
  const wide = boxBlur(added, w, h, Math.max(2, Math.round(size * STRAND_WIDTH)));
  for (let i = 0; i < zone.length; i++) added[i] *= 1 - smooth(wide[i], 0.3, 0.55);
  return added;
}

/**
 * The finished matte, from the confidence. The faces go in whole, the edge follows the brightness of the
 * photo, and what is sure is snapped to 0 or 255, so that background pixels really are out of it. Null when
 * the photo shows no person at all.
 */
export function finishMatte(seen: PersonSeen, faces: readonly Face[], target: MaskTarget): Uint8Array | null {
  const { w, h } = target;
  const conf = seen.person.slice();
  const ovals = faces.map((face) =>
    fillPolygon(
      face.outline.map(([u, v]) => [u * w, v * h] as const),
      w,
      h,
    ),
  );
  for (const oval of ovals) {
    for (let i = 0; i < conf.length; i++) if (oval[i] > conf[i]) conf[i] = oval[i];
  }
  const size = faces.length ? Math.max(...faces.map((f) => faceSize(f.box, w, h))) : Math.max(w, h) * NO_FACE_SIZE;
  const radius = Math.max(1, Math.round(size * REFINE_RADIUS));
  let shape: Float32Array = new Float32Array(w * h);
  const reach = new Float32Array(w * h);
  const rgba = target.color?.({ x: 0, y: 0, w, h });
  if (faces.length) {
    const { limit, head } = headLimit(faces, ovals, seen.hair, w, h);
    for (let i = 0; i < conf.length; i++) conf[i] *= limit[i];
    if (rgba) dropWhatLooksLikeBackground(conf, rgba, head, conf.length);
  }
  const soft = boxBlur(conf, w, h, radius);
  for (let i = 0; i < conf.length; i++) {
    shape[i] = smooth(conf[i], SURE_LOW, SURE_HIGH);
    reach[i] = smooth(soft[i], REACH_LOW, REACH_HIGH);
  }
  if (rgba) {
    for (const band of EDGE_BANDS) shape = followColors(shape, rgba, w, h, size * band);
    // The colors may correct the models in a band, so the limit of the models opens by the same amount.
    const open = grown(reach, w, h, Math.round(size * EDGE_BANDS[0]));
    reach.set(open);
  }
  const strands = rgba ? looseStrands(shape, rgba, seen.hair, w, h, size) : null;
  const guide = target.luma?.({ x: 0, y: 0, w, h });
  if (guide) shape = guidedFilter(guide, shape, w, h, radius, REFINE_EPS);
  const matte = new Uint8Array(w * h);
  let total = 0;
  for (let i = 0; i < matte.length; i++) {
    const value = Math.min(shape[i], reach[i]);
    matte[i] = Math.round(smooth(value, SNAP_LOW, SNAP_HIGH) * 255);
    total += matte[i];
  }
  // A face is a person, so it stays in whole however the refinement went.
  for (const oval of ovals) {
    for (let i = 0; i < matte.length; i++) {
      const value = Math.round(oval[i] * 255);
      if (value > matte[i]) matte[i] = value;
    }
  }
  if (faces.length) keepWhatTouchesFaces(matte, faces, w, h);
  fillInnerHoles(matte, w, h);
  // Last: a strand may touch nothing else, and the steps above would take it for a blob.
  if (strands) {
    for (let i = 0; i < matte.length; i++) {
      const value = Math.round(strands[i] * 255);
      if (value > matte[i]) matte[i] = value;
    }
  }
  return total / 255 / matte.length < MIN_PERSON ? null : matte;
}

/**
 * Fills what the matte leaves out in the middle of a person. Background that reaches no side of the photo is
 * either a real gap under an arm, which the models see with confidence, or a mistake of the colors on skin.
 * Small ones are the mistake. A gap under an arm is much larger than this.
 */
export function fillInnerHoles(matte: Uint8Array, w: number, h: number): void {
  const k = Math.min(1, PARTS_SIDE / Math.max(w, h));
  const gw = Math.max(1, Math.round(w * k));
  const gh = Math.max(1, Math.round(h * k));
  const empty = new Uint8Array(gw * gh);
  empty.fill(1);
  for (let y = 0; y < h; y++) {
    const gy = Math.min(gh - 1, Math.floor(y * k));
    for (let x = 0; x < w; x++) {
      if (matte[y * w + x] > PARTS_LEVEL) empty[gy * gw + Math.min(gw - 1, Math.floor(x * k))] = 0;
    }
  }
  const label = new Int32Array(gw * gh);
  const fills: boolean[] = [false];
  const stack: number[] = [];
  const limit = gw * gh * MAX_HOLE;
  for (let start = 0; start < empty.length; start++) {
    if (!empty[start] || label[start]) continue;
    const id = fills.length;
    let size = 0;
    let open = false;
    label[start] = id;
    stack.push(start);
    while (stack.length) {
      const at = stack.pop()!;
      size++;
      const x = at % gw;
      const y = Math.floor(at / gw);
      if (x === 0 || y === 0 || x === gw - 1 || y === gh - 1) open = true;
      for (const next of [x > 0 ? at - 1 : -1, x < gw - 1 ? at + 1 : -1, y > 0 ? at - gw : -1, y < gh - 1 ? at + gw : -1]) {
        if (next < 0 || !empty[next] || label[next]) continue;
        label[next] = id;
        stack.push(next);
      }
    }
    fills.push(!open && size < limit);
  }
  for (let y = 0; y < h; y++) {
    const gy = Math.min(gh - 1, Math.floor(y * k));
    for (let x = 0; x < w; x++) {
      if (fills[label[gy * gw + Math.min(gw - 1, Math.floor(x * k))]]) matte[y * w + x] = 255;
    }
  }
}

/**
 * Takes out what does not touch any face found. A warp moves a face and what is attached to it, and the
 * blob the model sees on a pillow, or someone behind with no face found, must stay where they are.
 */
export function keepWhatTouchesFaces(matte: Uint8Array, faces: readonly Face[], w: number, h: number): void {
  const k = Math.min(1, PARTS_SIDE / Math.max(w, h));
  const gw = Math.max(1, Math.round(w * k));
  const gh = Math.max(1, Math.round(h * k));
  const grid = new Uint8Array(gw * gh);
  for (let y = 0; y < h; y++) {
    const gy = Math.min(gh - 1, Math.floor(y * k));
    for (let x = 0; x < w; x++) {
      const at = gy * gw + Math.min(gw - 1, Math.floor(x * k));
      if (matte[y * w + x] > grid[at]) grid[at] = matte[y * w + x];
    }
  }
  const kept = new Uint8Array(gw * gh);
  const stack: number[] = [];
  const push = (at: number) => {
    if (grid[at] <= PARTS_LEVEL || kept[at]) return;
    kept[at] = 1;
    stack.push(at);
  };
  for (const face of faces) {
    const cx = Math.round((face.box.x + face.box.w / 2) * (gw - 1));
    const cy = Math.round((face.box.y + face.box.h / 2) * (gh - 1));
    push(cy * gw + cx);
  }
  while (stack.length) {
    const at = stack.pop()!;
    const x = at % gw;
    if (x > 0) push(at - 1);
    if (x < gw - 1) push(at + 1);
    if (at >= gw) push(at - gw);
    if (at < gw * (gh - 1)) push(at + gw);
  }
  // One cell of room around what stays, for the soft edge.
  const room = kept.slice();
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      if (!kept[y * gw + x]) continue;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy;
          const xx = x + dx;
          if (yy >= 0 && yy < gh && xx >= 0 && xx < gw) room[yy * gw + xx] = 1;
        }
      }
    }
  }
  for (let y = 0; y < h; y++) {
    const gy = Math.min(gh - 1, Math.floor(y * k));
    for (let x = 0; x < w; x++) {
      if (!room[gy * gw + Math.min(gw - 1, Math.floor(x * k))]) matte[y * w + x] = 0;
    }
  }
}
