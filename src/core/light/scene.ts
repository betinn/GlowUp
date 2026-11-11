/**
 * Builds the scene of a photo for Luzes: where the person is, where their skin and hair are, and how far each
 * point is from the edge of the person. Plain arrays and no browser APIs, so every step can be tested: the
 * answers of the segmenters come in as numbers.
 *
 * It is made once per photo, from the photo as it was opened, and goes into the saved project. A project then
 * opens with its light and no detector.
 */

import { boxBlur } from '../face/mask';
import type { PersonSeen } from '../face/person';
import type { Area } from '../face/mask';
import type { SceneData, SceneStats } from './types';

/** Long side of the grid of the scene. The segmenter sees 256 px, and the photo itself draws the edge finer. */
export const SCENE_SIDE = 1024;
/** The distance to the edge is kept up to this share of the long side, on each side of it. */
export const SCENE_SPAN = 0.16;
/** A photo with less of a person than this share has nobody to light. */
const MIN_PERSON = 0.004;
/**
 * With no face found, the segmenter alone says there is somebody, and on a photo of a wall or of a sky it
 * still calls a patch of it a person: 2% of a plain gradient. So a person with no face has to be this much of
 * the photo. The real photos with somebody in them have over half.
 */
const MIN_PERSON_ALONE = 0.06;
/** Confidence between these becomes the soft edge, before the photo refines it. */
const EDGE_LOW = 0.25;
const EDGE_HIGH = 0.75;
/**
 * Reach of the refinement by the photo, as a share of the long side, and the variance it treats as flat. The
 * photo guides with its three colors: dark hair on a dark red curtain differs in color and hardly in brightness.
 */
const REFINE_RADIUS = 0.012;
const REFINE_EPS = 1e-4;
/** What the refinement leaves between these becomes the edge, and the rest is in or out for sure. */
const SNAP_LOW = 0.08;
const SNAP_HIGH = 0.92;
/** With no face found, a face is taken to be this share of the long side. */
const NO_FACE_SIZE = 0.2;

const smooth = (v: number, lo: number, hi: number) => {
  const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};

/** The size of the grid of the scene for a photo. */
export function sceneSize(w: number, h: number): { w: number; h: number } {
  const k = Math.min(1, SCENE_SIDE / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/**
 * How far each cell is from the edge of `inside`, in cells: above zero inside and below zero outside. Two
 * sweeps carry the nearest cell of the other side along, which is exact enough for a soft light.
 */
export function signedDistance(inside: Uint8Array, w: number, h: number): Float32Array {
  const n = w * h;
  const out = new Float32Array(n);
  const far = w + h;
  for (const side of [1, 0]) {
    // The nearest cell that is not on this side, as an offset.
    const dx = new Int16Array(n);
    const dy = new Int16Array(n);
    const d2 = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const here = inside[i] ? 1 : 0;
      d2[i] = here === side ? Infinity : 0;
    }
    const look = (x: number, y: number, ox: number, oy: number) => {
      const xx = x + ox;
      const yy = y + oy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) return;
      const from = yy * w + xx;
      if (d2[from] === Infinity) return;
      const cx = dx[from] + ox;
      const cy = dy[from] + oy;
      const d = cx * cx + cy * cy;
      const at = y * w + x;
      if (d < d2[at]) {
        d2[at] = d;
        dx[at] = cx;
        dy[at] = cy;
      }
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        look(x, y, -1, 0);
        look(x, y, 0, -1);
        look(x, y, -1, -1);
        look(x, y, 1, -1);
      }
      for (let x = w - 1; x >= 0; x--) look(x, y, 1, 0);
    }
    for (let y = h - 1; y >= 0; y--) {
      for (let x = w - 1; x >= 0; x--) {
        look(x, y, 1, 0);
        look(x, y, 0, 1);
        look(x, y, 1, 1);
        look(x, y, -1, 1);
      }
      for (let x = 0; x < w; x++) look(x, y, -1, 0);
    }
    for (let i = 0; i < n; i++) {
      if ((inside[i] ? 1 : 0) !== side) continue;
      const d = d2[i] === Infinity ? far : Math.sqrt(d2[i]) - 0.5;
      out[i] = side ? d : -d;
    }
  }
  return out;
}

/**
 * Pulls the soft edge of `mask` to the edges of the photo, with the three colors of the photo as the guide:
 * around each cell, the mask is taken to be a plane over the colors. `rgb` holds the photo as RGBA bytes.
 */
export function guidedByColor(rgb: Uint8ClampedArray | Uint8Array, mask: Float32Array, w: number, h: number, r: number, eps: number): Float32Array {
  const n = w * h;
  const blur = (src: Float32Array) => boxBlur(src, w, h, r);
  const channel = (c: number) => {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = rgb[i * 4 + c] / 255;
    return out;
  };
  const times = (a: Float32Array, b: Float32Array) => {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = a[i] * b[i];
    return out;
  };
  const I = [channel(0), channel(1), channel(2)];
  const mean = I.map(blur);
  const meanP = blur(mask);
  const cov = I.map((c) => blur(times(c, mask)));
  // The six different entries of the covariance of the colors: rr, rg, rb, gg, gb, bb.
  const pairs: [number, number][] = [[0, 0], [0, 1], [0, 2], [1, 1], [1, 2], [2, 2]];
  const sigma = pairs.map(([a, b]) => blur(times(I[a], I[b])));
  const ar = new Float32Array(n);
  const ag = new Float32Array(n);
  const ab = new Float32Array(n);
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const mr = mean[0][i];
    const mg = mean[1][i];
    const mb = mean[2][i];
    const p = meanP[i];
    const rr = sigma[0][i] - mr * mr + eps;
    const rg = sigma[1][i] - mr * mg;
    const rb = sigma[2][i] - mr * mb;
    const gg = sigma[3][i] - mg * mg + eps;
    const gb = sigma[4][i] - mg * mb;
    const bb = sigma[5][i] - mb * mb + eps;
    const cr = cov[0][i] - mr * p;
    const cg = cov[1][i] - mg * p;
    const cb = cov[2][i] - mb * p;
    // The inverse of a symmetric matrix of three by three, by its cofactors.
    const c00 = gg * bb - gb * gb;
    const c01 = rb * gb - rg * bb;
    const c02 = rg * gb - rb * gg;
    const det = rr * c00 + rg * c01 + rb * c02;
    const k = det > 1e-20 ? 1 / det : 0;
    const x = (c00 * cr + c01 * cg + c02 * cb) * k;
    const y = (c01 * cr + (rr * bb - rb * rb) * cg + (rb * rg - rr * gb) * cb) * k;
    const z = (c02 * cr + (rb * rg - rr * gb) * cg + (rr * gg - rg * rg) * cb) * k;
    ar[i] = x;
    ag[i] = y;
    ab[i] = z;
    b[i] = p - x * mr - y * mg - z * mb;
  }
  const mar = blur(ar);
  const mag = blur(ag);
  const mab = blur(ab);
  const mb2 = blur(b);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.min(1, Math.max(0, mar[i] * I[0][i] + mag[i] * I[1][i] + mab[i] * I[2][i] + mb2[i]));
  return out;
}

/** The byte that holds a distance, given as a share of the long side: 128 is the edge. */
export const distanceByte = (share: number) => Math.round(127.5 + 127.5 * Math.min(1, Math.max(-1, share / SCENE_SPAN)));

export interface SceneTarget {
  w: number;
  h: number;
  /** The photo on the grid as RGBA bytes. */
  rgba: Uint8ClampedArray | Uint8Array;
}

const toLinear = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/**
 * The scene, from what the segmenters saw. `faces` are the boxes of the faces found, in image UV, the main one
 * first. Null when the photo shows nobody.
 */
export function buildScene(seen: Pick<PersonSeen, 'person' | 'skin' | 'hair'>, faces: readonly Area[], target: SceneTarget): SceneData | null {
  const { w, h, rgba } = target;
  const n = w * h;
  const long = Math.max(w, h);
  const radius = Math.max(1, Math.round(long * REFINE_RADIUS));
  const edge = new Float32Array(n);
  for (let i = 0; i < n; i++) edge[i] = smooth(seen.person[i], EDGE_LOW, EDGE_HIGH);
  const person = guidedByColor(rgba, edge, w, h, radius, REFINE_EPS);
  for (let i = 0; i < n; i++) person[i] = smooth(person[i], SNAP_LOW, SNAP_HIGH);
  let total = 0;
  for (let i = 0; i < n; i++) total += person[i];
  if (total / n < (faces.length ? MIN_PERSON : MIN_PERSON_ALONE)) return null;

  const inside = new Uint8Array(n);
  for (let i = 0; i < n; i++) inside[i] = person[i] >= 0.5 ? 1 : 0;
  const distance = signedDistance(inside, w, h);

  const data = new Uint8Array(n * 4);
  let backY = 0;
  let backN = 0;
  let skinY = 0;
  let skinN = 0;
  let personY = 0;
  let personN = 0;
  let topY = h;
  let topX = 0;
  let topN = 0;
  for (let i = 0; i < n; i++) {
    const p = person[i];
    const skin = Math.min(p, smooth(seen.skin[i], EDGE_LOW, EDGE_HIGH));
    const hair = Math.min(p, smooth(seen.hair[i], EDGE_LOW, EDGE_HIGH));
    data[i * 4] = Math.round(p * 255);
    data[i * 4 + 1] = Math.round(skin * 255);
    data[i * 4 + 2] = Math.round(hair * 255);
    data[i * 4 + 3] = distanceByte(distance[i] / long);
    const y = 0.2126 * toLinear(rgba[i * 4]) + 0.7152 * toLinear(rgba[i * 4 + 1]) + 0.0722 * toLinear(rgba[i * 4 + 2]);
    backY += (1 - p) * y;
    backN += 1 - p;
    skinY += skin * y;
    skinN += skin;
    personY += p * y;
    personN += p;
    if (p > 0.5) {
      const row = Math.floor(i / w);
      if (row < topY) {
        topY = row;
        topX = 0;
        topN = 0;
      }
      if (row === topY) {
        topX += i % w;
        topN++;
      }
    }
  }

  const stats: SceneStats = {
    face: [0.5, 0.4],
    faceSize: NO_FACE_SIZE,
    backY: backN > 1 ? backY / backN : 0.18,
    // With no skin in sight, the person stands in for it.
    skinY: skinN > n * 0.002 ? skinY / skinN : personN > 1 ? personY / personN : 0.18,
    personY: personN > 1 ? personY / personN : 0.18,
  };
  const main = faces[0];
  if (main) {
    stats.face = [main.x + main.w / 2, main.y + main.h / 2];
    stats.faceSize = Math.max(main.w * w, main.h * h) / long;
  } else if (topN) {
    // A head seen from behind: about one face below the top of the person.
    stats.face = [topX / topN / w, Math.min(1, (topY + NO_FACE_SIZE * long * 0.6) / h)];
  }
  return { w, h, data, stats };
}

/** The scene as one run of bytes for a saved project, and back. The numbers go in a short header. */
export function packScene(scene: SceneData): Uint8Array {
  const head = new TextEncoder().encode(JSON.stringify({ w: scene.w, h: scene.h, stats: scene.stats }));
  const out = new Uint8Array(4 + head.length + scene.data.length);
  new DataView(out.buffer).setUint32(0, head.length);
  out.set(head, 4);
  out.set(scene.data, 4 + head.length);
  return out;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Null when the bytes are not a scene. */
export function unpackScene(bytes: Uint8Array): SceneData | null {
  if (bytes.length < 8) return null;
  const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
  if (length > bytes.length - 4) return null;
  try {
    const head = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + length))) as { w?: unknown; h?: unknown; stats?: Partial<SceneStats> };
    const { w, h, stats } = head;
    if (!Number.isInteger(w) || !Number.isInteger(h) || (w as number) < 1 || (h as number) < 1 || !stats) return null;
    const data = bytes.subarray(4 + length);
    if (data.length !== (w as number) * (h as number) * 4) return null;
    const { face, faceSize, backY, skinY, personY } = stats;
    if (!Array.isArray(face) || face.length !== 2 || !face.every(finite) || ![faceSize, backY, skinY, personY].every(finite)) return null;
    return { w: w as number, h: h as number, data: data.slice(), stats: { face: [face[0], face[1]], faceSize: faceSize!, backY: backY!, skinY: skinY!, personY: personY! } };
  } catch {
    return null;
  }
}
