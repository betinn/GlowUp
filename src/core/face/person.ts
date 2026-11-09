/**
 * Works out which pixels of a photo belong to a person, and which of those to a head, for the warps of the
 * face menu. Plain arrays and no browser APIs, so every step can be tested: the models come in as functions.
 *
 * The segmenter names each pixel: background, hair, skin of the face, skin of the body, clothes, or something
 * worn. A head is hair, the skin of the face and what is worn on it. That split is what lets a jaw move
 * without the neck, the shoulders or a pillow beside them going along.
 *
 * The segmenter sees its input at 256 px, so it looks at the whole photo once, for bodies and for people with
 * no face found, and twice at each head, wide and close, where the edge is what matters. The hair segmenter
 * adds the strands the first one leaves out, and the photo itself refines the edge at the end.
 *
 * The results are the mattes: 0 is outside for sure, and that is the promise the layers keep.
 */

import { faceSize, sampleCut, type HairCut } from './hair';
import { boxBlur, fillPolygon, guidedFilter, type Area, type MaskTarget } from './mask';
import { nearestCells } from './plate';
import { CHIN, type Face } from './scan';

/** Side of the squares around a head, as multiples of the face size: one for the hair and the shoulders, one for the edge of the face. */
const CROP_SPAN = 3.4;
const CLOSE_SPAN = 2.1;
/** Each square sits this much of the face size below the middle of the face. */
const CROP_DROP = 0.35;
const CLOSE_DROP = 0.08;
/** Across this share of a crop, its answer gives way to the one from further away. */
const CROP_BLEND = 0.12;
/** The hair segmenter counts between these, and only next to what the other one calls a person. */
const HAIR_LOW = 0.45;
const HAIR_HIGH = 0.8;
const HAIR_NEAR = 0.2;
/**
 * What is worn counts as part of a head inside the outline of the face grown by this much: glasses, whose arms
 * stick out past a turned face, and earrings. Toward the chin it grows much less, so a necklace stays out.
 */
const WORN_ROOM = 1.75;
const WORN_BELOW = 1.12;
/**
 * Hair has no clean edge: loose ends and a soft halo go a little past what the models call hair. They have to
 * leave with the head, or they stay behind as a drawing of where it was. So around hair the matte of the head
 * goes this share of the face size further, and fades over the last part of it.
 */
const HAIR_HALO = 0.03;
/** Hair at this confidence has a halo. */
const HAIR_SEEN = 0.5;
/**
 * Past the halo, loose ends still reach this share of the face size into the background. They are too thin to
 * be part of a head, and when the head moves they must not stay floating where it was. A trace in the matte
 * marks that ground: nothing of the head is there, but the plate takes over when the head moves. See `TRACE`.
 */
const LOOSE_ENDS = 0.1;
/**
 * A value of the matte at or below this is a trace: none of the layer is there. From 1 up to `TRACE_FULL` it
 * says how much the plate replaces the photo there once the layer moves.
 */
export const TRACE = 8;
export const TRACE_FULL = 4;
/** The middle of a face is a head whatever the models say, inside its outline shrunk to this. */
const SURE_FACE = 0.86;
/** Confidence between these becomes the soft edge before the photo refines it. */
const EDGE_LOW = 0.3;
const EDGE_HIGH = 0.7;
/** Reach of the refinement, as a share of the face size, and at least a pixel. */
const REFINE_RADIUS = 0.012;
const REFINE_EPS = 0.0015;
/** Below this, out of 1, a pixel is outside for sure. Above the second, inside for sure. */
const SNAP_LOW = 0.08;
const SNAP_HIGH = 0.92;
/** Side of the grid that looks for what touches a face. Plenty for telling a body from a blob. */
const PARTS_SIDE = 384;
/** A cell above this is part of the person, when looking for what touches a face. */
const PARTS_LEVEL = 96;
/** A hole in the middle of a person smaller than this share of the photo is filled. */
const MAX_HOLE = 0.01;
/** A matte with less than this share of the photo found no person at all. */
const MIN_PERSON = 0.002;
/**
 * A head casts a shadow on the neck right under the jaw, and that shadow has to go where the jaw goes, or it
 * stays behind as a second jawline. So over the body the matte of the head does not stop at the jaw: it fades
 * out across this share of the face size. Over the background it stops dead, as it must.
 */
const SHADOW_REACH = 0.1;
/** Size given to the refinement when the photo has no face to measure. */
const NO_FACE_SIZE = 0.3;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function smooth(v: number, lo: number, hi: number): number {
  const t = clamp((v - lo) / (hi - lo), 0, 1);
  return t * t * (3 - 2 * t);
}

/** A square around one head, in pixels of a photo of `w` by `h`. It slides inside the photo near an edge. */
function cropAround(box: Area, w: number, h: number, span: number, drop: number): Area {
  const size = faceSize(box, w, h);
  const side = size * span;
  const sw = Math.min(side, w);
  const sh = Math.min(side, h);
  const cx = (box.x + box.w / 2) * w;
  const cy = (box.y + box.h / 2) * h + size * drop;
  const x = Math.round(clamp(cx - sw / 2, 0, w - sw));
  const y = Math.round(clamp(cy - sh / 2, 0, h - sh));
  return { x, y, w: Math.min(w - x, Math.round(sw)), h: Math.min(h - y, Math.round(sh)) };
}

/** The wide square around one head: the hair and the shoulders. */
export const headCrop = (box: Area, w: number, h: number): Area => cropAround(box, w, h, CROP_SPAN, CROP_DROP);

/** The close square around one head: the edge of the face, at the most pixels the model can give it. */
export const faceCrop = (box: Area, w: number, h: number): Area => cropAround(box, w, h, CLOSE_SPAN, CLOSE_DROP);

/** How much a crop counts at a point: all of it inside, fading out toward each side that is not the side of the photo. */
function cropWeight(fx: number, fy: number, area: Area, w: number, h: number): number {
  let k = 1;
  if (area.x > 0) k = Math.min(k, fx / CROP_BLEND);
  if (area.y > 0) k = Math.min(k, fy / CROP_BLEND);
  if (area.x + area.w < w) k = Math.min(k, (1 - fx) / CROP_BLEND);
  if (area.y + area.h < h) k = Math.min(k, (1 - fy) / CROP_BLEND);
  return smooth(k, 0, 1);
}

/** What the person segmenter says about a crop: how sure it is of each class, row by row, from 0 to 1. */
export interface PartsCut {
  w: number;
  h: number;
  back: Float32Array;
  hair: Float32Array;
  /** Skin that is not of the face: neck, shoulders, arms, hands. */
  body: Float32Array;
  face: Float32Array;
  clothes: Float32Array;
  /** What is worn or held: glasses, earrings, a necklace, a bag. */
  other: Float32Array;
}

/** Calls the models, so this file does not depend on them. Areas are in pixels of the photo. */
export interface PersonModels {
  parts(area: Area): PartsCut;
  hair(area: Area): HairCut;
}

/** What the models say about each cell of the target, from 0 to 1. */
export interface PersonSeen {
  person: Float32Array;
  head: Float32Array;
  /** Bare skin, of the face or of the body. */
  skin: Float32Array;
  hair: Float32Array;
}

/** The confidence that each cell of `target` is a person, and a head, before the photo refines it. Null when stopped. */
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
  const n = w * h;
  const person = new Float32Array(n);
  const head = new Float32Array(n);
  const skin = new Float32Array(n);
  const hair = new Float32Array(n);
  const steps = faces.length * 2 + 1;
  let done = 0;
  const whole = models.parts({ x: 0, y: 0, w: size.w, h: size.h });
  const part = (cut: PartsCut, data: Float32Array): HairCut => ({ data, w: cut.w, h: cut.h });
  {
    const back = part(whole, whole.back);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) person[y * w + x] = 1 - sampleCut(back, (x + 0.5) / w, (y + 0.5) / h);
    }
  }
  report(++done / steps);
  const kx = w / size.w;
  const ky = h / size.h;
  for (const face of faces) {
    // Glasses and earrings belong to the head. A necklace or a bag does not.
    const worn = fillPolygon(grownOutline(face, WORN_ROOM, w, h, WORN_BELOW), w, h);
    for (const close of [false, true]) {
      await pause();
      if (stopped()) return null;
      const area = close ? faceCrop(face.box, size.w, size.h) : headCrop(face.box, size.w, size.h);
      const parts = models.parts(area);
      // The hair segmenter looks at more pixels, and only the wide square holds all the hair.
      const strands = close ? null : models.hair(area);
      const cuts = { back: part(parts, parts.back), hair: part(parts, parts.hair), face: part(parts, parts.face), other: part(parts, parts.other), body: part(parts, parts.body) };
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
          const at = y * w + x;
          const all = 1 - sampleCut(cuts.back, fx, fy);
          const faceSkin = sampleCut(cuts.face, fx, fy);
          skin[at] += (Math.min(1, faceSkin + sampleCut(cuts.body, fx, fy)) - skin[at]) * k;
          let fur = sampleCut(cuts.hair, fx, fy);
          let top = fur + faceSkin + sampleCut(cuts.other, fx, fy) * worn[at];
          if (strands) {
            const fine = smooth(sampleCut(strands, fx, fy), HAIR_LOW, HAIR_HIGH) * smooth(all, 0, HAIR_NEAR);
            fur = Math.max(fur, fine);
            top = Math.max(top, fine);
          }
          hair[at] = close ? hair[at] + (fur - hair[at]) * k : Math.max(hair[at], fur * k);
          top = Math.min(1, top);
          person[at] += (Math.max(all, top) - person[at]) * k;
          // A head seen from close replaces the one seen from far, and neither erases the head of someone else.
          head[at] = close ? head[at] + (top - head[at]) * k : Math.max(head[at], top * k);
        }
      }
      report(++done / steps);
    }
  }
  return { person, head, skin, hair };
}

/**
 * The outline of a face scaled around its middle, in cells of the target. `below` is the scale at the chin,
 * when it differs: the outline then grows less the nearer a point is to the chin.
 */
function grownOutline(face: Face, by: number, w: number, h: number, below = by): (readonly [number, number])[] {
  const cx = face.box.x + face.box.w / 2;
  const cy = face.box.y + face.box.h / 2;
  const top = face.outline[0];
  const chin = face.outline[CHIN] ?? top;
  const ax = (chin[0] - top[0]) * w;
  const ay = (chin[1] - top[1]) * h;
  const a2 = ax * ax + ay * ay || 1;
  return face.outline.map(([u, v]) => {
    const t = ((u - top[0]) * w * ax + (v - top[1]) * h * ay) / a2;
    const k = by + (below - by) * smooth(t, 0.8, 1.02);
    return [(cx + (u - cx) * k) * w, (cy + (v - cy) * k) * h] as const;
  });
}

/** The mattes of a photo, as bytes on the grid of the masks. A head is always inside the person. */
export interface Mattes {
  person: Uint8Array;
  head: Uint8Array;
}

/**
 * The finished mattes, from the confidence. The middle of each face goes in whole, the edge follows the
 * brightness of the photo, and what is sure is snapped to 0 or 255, so that the pixels outside really are out
 * of it. Null when the photo shows no person at all, or no face to hang the layers on.
 */
export function finishMattes(seen: PersonSeen, faces: readonly Face[], target: MaskTarget): Mattes | null {
  // Layers are for moving a head, and what touches no face found is left out of them anyway.
  if (!faces.length) return null;
  const { w, h } = target;
  const n = w * h;
  const size = faces.length ? Math.max(...faces.map((f) => faceSize(f.box, w, h))) : Math.max(w, h) * NO_FACE_SIZE;
  const radius = Math.max(1, Math.round(size * REFINE_RADIUS));
  const guide = target.luma?.({ x: 0, y: 0, w, h });
  const cores = faces.map((face) => fillPolygon(grownOutline(face, SURE_FACE, w, h), w, h));
  const finish = (conf: Float32Array): Uint8Array => {
    let shape = new Float32Array(n);
    for (let i = 0; i < n; i++) shape[i] = smooth(conf[i], EDGE_LOW, EDGE_HIGH);
    if (guide) shape = guidedFilter(guide, shape, w, h, radius, REFINE_EPS) as Float32Array<ArrayBuffer>;
    const matte = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const value = Math.round(smooth(shape[i], SNAP_LOW, SNAP_HIGH) * 255);
      // The lowest values are kept for traces, which mean something else. See `TRACE`.
      matte[i] = value > TRACE ? value : 0;
    }
    for (const core of cores) {
      for (let i = 0; i < n; i++) {
        const value = Math.round(core[i] * 255);
        if (value > matte[i]) matte[i] = value;
      }
    }
    if (faces.length) keepWhatTouchesFaces(matte, faces, w, h);
    fillInnerHoles(matte, w, h);
    return matte;
  };
  const person = finish(seen.person);
  let total = 0;
  for (let i = 0; i < n; i++) total += person[i];
  if (total / 255 / n < MIN_PERSON) return null;
  const head = finish(seen.head);
  hairHalo(head, seen.hair, w, h, size * HAIR_HALO, size * LOOSE_ENDS, person, guide);
  for (let i = 0; i < n; i++) if (head[i] > person[i]) person[i] = head[i];
  castShadow(head, person, seen.skin, w, h, size * SHADOW_REACH);
  return { person, head };
}

/** A loose end stands out from the background around it by this much brightness, out of 1, and by this many times what is usual there. */
const END_STANDS_OUT = 0.03;
const END_TIMES_USUAL = 3;

/**
 * Where loose ends of hair show against the background, from 0 to 1, among the cells of `zone`. A loose end is
 * a thin thing brighter or darker than the background around it. On a plain wall that is the hair and nothing
 * else. On asphalt everything stands out a little, so only what stands out much more than usual counts: there
 * a faint end is lost in the grain anyway.
 */
function looseEnds(luma: Float32Array, zone: Uint8Array, person: Uint8Array, w: number, h: number, radius: number): Float32Array {
  const n = w * h;
  const open = new Float32Array(n);
  const lit = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (person[i]) continue;
    open[i] = 1;
    lit[i] = luma[i];
  }
  const r = Math.max(2, Math.round(radius));
  const weight = boxBlur(open, w, h, r);
  const sum = boxBlur(lit, w, h, r);
  const apart = new Float32Array(n);
  const sample: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!zone[i] || weight[i] <= 1e-4) continue;
    apart[i] = Math.abs(luma[i] - sum[i] / weight[i]);
    if (i % 3 === 0) sample.push(apart[i]);
  }
  sample.sort((a, b) => a - b);
  const usual = sample.length ? sample[sample.length >> 1] : 0;
  const from = Math.max(END_STANDS_OUT, usual * END_TIMES_USUAL);
  for (let i = 0; i < n; i++) apart[i] = zone[i] ? smooth(apart[i], from, from * 1.8) : 0;
  // A little room around each end, for its soft sides.
  const near = boxBlur(apart, w, h, 2);
  for (let i = 0; i < n; i++) near[i] = zone[i] ? smooth(near[i], 0.03, 0.16) : 0;
  return near;
}

/**
 * Takes the matte of the heads `reach` cells further around hair, fading over the last part, and leaves a trace
 * on the background up to `loose` cells from the hair, where loose ends show. See `HAIR_HALO` and `LOOSE_ENDS`.
 * Without the brightness of the photo, all that ground gets the trace.
 */
export function hairHalo(head: Uint8Array, hair: Float32Array, w: number, h: number, reach: number, loose: number, person: Uint8Array, luma?: Float32Array): void {
  if (reach < 1) return;
  const fur = new Uint8Array(head.length);
  let any = false;
  for (let i = 0; i < head.length; i++) {
    if (head[i] > 127 && hair[i] > HAIR_SEEN) {
      fur[i] = 1;
      any = true;
    }
  }
  if (!any) return;
  const near = nearestCells(fur, w, h);
  const far = new Float32Array(head.length).fill(Infinity);
  // The ground loose ends can reach. Only over the background: next to hair, a shoulder has edges of its own
  // that a guess would blur.
  const zone = new Uint8Array(head.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const at = y * w + x;
      if (head[at] === 255) continue;
      const from = near[at];
      const fx = from % w;
      const d = Math.hypot(fx - x, (from - fx) / w - y);
      if (d >= loose) continue;
      far[at] = d;
      const value = d < reach ? Math.round(255 * (1 - smooth(d, reach * 0.55, reach))) : 0;
      if (value > TRACE) {
        if (value > head[at]) head[at] = value;
      } else if (!person[at] && !head[at]) {
        zone[at] = 1;
      }
    }
  }
  const ends = luma ? looseEnds(luma, zone, person, w, h, loose * 0.35) : null;
  for (let at = 0; at < zone.length; at++) {
    if (!zone[at]) continue;
    const value = Math.round(TRACE_FULL * (1 - smooth(far[at], loose * 0.8, loose)) * (ends ? ends[at] : 1));
    if (value > head[at]) head[at] = value;
  }
}

/**
 * Lets the matte of the heads fade out over the bare skin next to them, across `reach` cells. See
 * `SHADOW_REACH`. Only over skin: a collar or a necklace has edges of its own, which a guess would blur.
 */
export function castShadow(head: Uint8Array, person: Uint8Array, skin: Float32Array, w: number, h: number, reach: number): void {
  if (reach < 1) return;
  const solid = new Uint8Array(head.length);
  for (let i = 0; i < head.length; i++) solid[i] = head[i] > 127 ? 1 : 0;
  const near = nearestCells(solid, w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const at = y * w + x;
      const from = near[at];
      if (from < 0 || solid[at] || !person[at]) continue;
      const fx = from % w;
      const fy = (from - fx) / w;
      const d = Math.hypot(fx - x, fy - y);
      if (d >= reach) continue;
      const fade = 1 - smooth(d, 0, reach);
      const value = Math.round(fade * fade * person[at] * smooth(skin[at], EDGE_LOW, EDGE_HIGH));
      if (value > TRACE && value > head[at]) head[at] = value;
    }
  }
}

/**
 * Fills what the matte leaves out in the middle of a person. Background that reaches no side of the photo is
 * either a real gap under an arm, which the models see with confidence, or a mistake on skin or behind a lens.
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
 * Takes out what does not touch any face found. A warp moves a face and what is attached to it, and a blob
 * the model sees on a pillow, or someone behind with no face found, must stay where they are.
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
