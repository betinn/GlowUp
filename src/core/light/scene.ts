/**
 * Builds the scene of a photo for Luzes: how far each point is from the camera, where the person is, with the
 * soft edge that hair has, and where their skin and hair are. Plain arrays and no browser APIs, so every step can
 * be tested: the answers of the models come in as numbers.
 *
 * It is made once per photo, from the photo as it was opened, and goes into the saved project. A project then
 * opens with its light and no model.
 */

import { boxBlur, softBlur } from '../face/mask';
import type { Area } from '../face/mask';
import { resample } from './models';
import type { SceneData, SceneStats } from './types';

/** Long side of the grid of the scene. */
export const SCENE_SIDE = 1024;
/** Confidence of the segmenters between these becomes the soft edge of skin and of hair. */
const EDGE_LOW = 0.25;
const EDGE_HIGH = 0.75;
/**
 * Reach of the refinement of the matte by the photo, as a share of the long side, and the variance it treats as
 * flat. The photo guides with its three colors: dark hair on a dark red curtain differs in color and hardly in
 * brightness.
 */
const REFINE_RADIUS = 0.006;
const REFINE_EPS = 1e-4;
/** What the refinement leaves outside these is in or out for sure. */
const SNAP_LOW = 0.02;
const SNAP_HIGH = 0.98;
/** With no face found, a face is taken to be this share of the long side. */
const NO_FACE_SIZE = 0.2;
/** A matte this solid is the person for sure, when the depth the light is aimed at is read. */
const SOLID = 0.9;
/** Fewer cells than this share of the grid are too few to read a depth from. */
const MIN_CELLS = 0.0005;
/** Blurs of the scene, as shares of the long side: each side of the edge, the shade of the skin, and the two glows. */
const SIDE_BLUR = 0.012;
const SHADE_BLUR = 0.03;
export const GLOW_SMALL = 0.004;
export const GLOW_WIDE = 0.05;
/** The shade of the skin is kept between this many stops above and below its mean. */
export const SHADE_STOPS = 2.5;
/** Depths are kept up to this many times the depth of the subject, in sixteen bits. */
const DEPTH_TOP = 8;

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

export interface SceneTarget {
  w: number;
  h: number;
  /** The photo on the grid as RGBA bytes. */
  rgba: Uint8ClampedArray | Uint8Array;
}

/** What the models and the segmenters saw in the photo. */
export interface SceneSeen {
  /** Disparity from the depth model, on its own grid: larger is nearer. */
  depth: Float32Array;
  dw: number;
  dh: number;
  /** How much of each point is a person, from the matte model, on its own grid. */
  matte: Float32Array;
  mw: number;
  mh: number;
  /** Bare skin and hair from the segmenters, on the grid of the scene. Left out, the photo has neither. */
  skin?: Float32Array;
  hair?: Float32Array;
}

const toLinear = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** The value below which `share` of the first `count` values fall. */
function quantile(values: Float32Array, count: number, share: number): number {
  const sorted = values.slice(0, count).sort();
  return sorted[Math.min(count - 1, Math.floor(count * share))];
}

/**
 * The scene, from what the models saw. `faces` are the boxes of the faces found, in image UV. With nobody in the
 * photo the scene still stands: the light then falls on whatever is nearest.
 */
export function buildScene(seen: SceneSeen, faces: readonly Area[], target: SceneTarget): SceneData {
  const { w, h, rgba } = target;
  const n = w * h;
  const long = Math.max(w, h);

  // The matte follows the edges of the photo itself.
  const coarse = resample(seen.matte, seen.mw, seen.mh, w, h).slice();
  for (let i = 0; i < n; i++) coarse[i] = Math.min(1, Math.max(0, coarse[i]));
  const matte = guidedByColor(rgba, coarse, w, h, Math.max(1, Math.round(long * REFINE_RADIUS)), REFINE_EPS);
  for (let i = 0; i < n; i++) matte[i] = smooth(matte[i], SNAP_LOW, SNAP_HIGH);

  const skin = new Float32Array(n);
  const hair = new Float32Array(n);
  const luma = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (seen.skin) skin[i] = Math.min(matte[i], smooth(seen.skin[i], EDGE_LOW, EDGE_HIGH));
    if (seen.hair) hair[i] = Math.min(matte[i], smooth(seen.hair[i], EDGE_LOW, EDGE_HIGH));
    luma[i] = 0.2126 * toLinear(rgba[i * 4]) + 0.7152 * toLinear(rgba[i * 4 + 1]) + 0.0722 * toLinear(rgba[i * 4 + 2]);
  }

  // The depth the light is aimed at: the biggest face when there is one, else the person, else what is nearest.
  const depth = resample(seen.depth, seen.dw, seen.dh, w, h).slice();
  const main = faces.length ? faces.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a)) : null;
  const picked = new Float32Array(n);
  const pick = (inside: (x: number, y: number) => boolean) => {
    let count = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (matte[i] > SOLID && inside(x, y)) picked[count++] = depth[i];
      }
    }
    return count;
  };
  let count = main ? pick((x, y) => x >= main.x * w && x < (main.x + main.w) * w && y >= main.y * h && y < (main.y + main.h) * h) : 0;
  if (count < n * MIN_CELLS) count = pick(() => true);
  const aimed = Math.max(count >= n * MIN_CELLS ? quantile(picked, count, 0.5) : quantile(depth, n, 0.9), 1e-6);
  for (let i = 0; i < n; i++) depth[i] = Math.min(DEPTH_TOP, Math.max(0, depth[i] / aimed));

  // Each side of the edge of the person keeps its own depth, and the matte says which side a point is on.
  const times = (a: Float32Array, b: (i: number) => number) => {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = a[i] * b(i);
    return out;
  };
  const glowSmall = softBlur(matte, w, h, long * GLOW_SMALL);
  const glowWide = softBlur(matte, w, h, long * GLOW_WIDE);
  // Only what is well inside the person speaks for their side, and only what is well outside for the other:
  // right at the edge the depth is a blend of the two, and would pull each side toward the other.
  const inside = new Float32Array(n);
  const outside = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    inside[i] = Math.max(0, 2 * glowSmall[i] - 1) ** 2;
    outside[i] = Math.max(0, 1 - 2 * glowSmall[i]) ** 2;
  }
  const sideBlur = long * SIDE_BLUR;
  const frontShare = softBlur(inside, w, h, sideBlur);
  const behindShare = softBlur(outside, w, h, sideBlur);
  const front = softBlur(
    times(depth, (i) => inside[i]),
    w,
    h,
    sideBlur,
  );
  const behind = softBlur(
    times(depth, (i) => outside[i]),
    w,
    h,
    sideBlur,
  );
  const shadeBlur = long * SHADE_BLUR;
  const skinShare = softBlur(skin, w, h, shadeBlur);
  const skinLight = softBlur(
    times(luma, (i) => skin[i]),
    w,
    h,
    shadeBlur,
  );

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
    const p = matte[i];
    const y = luma[i];
    backY += (1 - p) * y;
    backN += 1 - p;
    skinY += skin[i] * y;
    skinN += skin[i];
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
  const few = n * 0.002;
  const wholeY = (backY + personY) / n;
  const stats: SceneStats = {
    face: [0.5, 0.4],
    faceSize: NO_FACE_SIZE,
    backY: backN > few ? backY / backN : wholeY,
    // With no skin in sight, the person stands in for it, and with nobody the photo does.
    skinY: skinN > few ? skinY / skinN : personN > few ? personY / personN : wholeY,
    personY: personN > few ? personY / personN : wholeY,
  };
  if (main) {
    stats.face = [main.x + main.w / 2, main.y + main.h / 2];
    stats.faceSize = Math.max(main.w * w, main.h * h) / long;
  } else if (topN) {
    // A head seen from behind: about one face below the top of the person.
    stats.face = [topX / topN / w, Math.min(1, (topY + NO_FACE_SIZE * long * 0.6) / h)];
  }

  const data = new Uint8Array(n * 4);
  const field = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    // Far from the edge one side has nothing to say, and the depth of the point itself stands in.
    const hasFront = smooth(frontShare[i], 0.02, 0.2);
    const hasBehind = smooth(behindShare[i], 0.02, 0.2);
    field[i * 4] = hasFront * (front[i] / Math.max(frontShare[i], 1e-3)) + (1 - hasFront) * depth[i];
    field[i * 4 + 1] = hasBehind * (behind[i] / Math.max(behindShare[i], 1e-3)) + (1 - hasBehind) * depth[i];
    field[i * 4 + 2] = glowSmall[i];
    field[i * 4 + 3] = glowWide[i];
    // How many stops the skin around this point is from the mean of the skin: a light that fills takes them back.
    const local = skinShare[i] > 1e-3 ? skinLight[i] / skinShare[i] : stats.skinY;
    const stops = Math.min(SHADE_STOPS, Math.max(-SHADE_STOPS, Math.log2(Math.max(stats.skinY, 0.01) / Math.max(local, 0.004))));
    data[i * 4] = Math.round(matte[i] * 255);
    data[i * 4 + 1] = Math.round(skin[i] * 255);
    data[i * 4 + 2] = Math.round(hair[i] * 255);
    data[i * 4 + 3] = Math.round(127.5 + (127.5 * stops) / SHADE_STOPS);
  }
  return { w, h, data, field, stats };
}

/**
 * The scene as one run of bytes for a saved project, and back. The numbers go in a short header. The two depths
 * go in sixteen bits each, and the glows are made again from the matte when the project opens.
 */
export function packScene(scene: SceneData): Uint8Array {
  const n = scene.w * scene.h;
  const head = new TextEncoder().encode(JSON.stringify({ v: 2, w: scene.w, h: scene.h, stats: scene.stats }));
  const out = new Uint8Array(4 + head.length + n * 8);
  const view = new DataView(out.buffer);
  view.setUint32(0, head.length);
  out.set(head, 4);
  out.set(scene.data, 4 + head.length);
  let at = 4 + head.length + n * 4;
  const k = 65535 / DEPTH_TOP;
  for (let i = 0; i < n; i++) {
    view.setUint16(at, Math.round(Math.min(DEPTH_TOP, Math.max(0, scene.field[i * 4])) * k));
    view.setUint16(at + 2, Math.round(Math.min(DEPTH_TOP, Math.max(0, scene.field[i * 4 + 1])) * k));
    at += 4;
  }
  return out;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Null when the bytes are not a scene, or are one from before the scene had depth. */
export function unpackScene(bytes: Uint8Array): SceneData | null {
  if (bytes.length < 8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(0);
  if (length > bytes.length - 4) return null;
  try {
    const head = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + length))) as { v?: unknown; w?: unknown; h?: unknown; stats?: Partial<SceneStats> };
    const { w, h, stats } = head;
    if (head.v !== 2 || !Number.isInteger(w) || !Number.isInteger(h) || (w as number) < 1 || (h as number) < 1 || !stats) return null;
    const gw = w as number;
    const gh = h as number;
    const n = gw * gh;
    if (bytes.length - 4 - length !== n * 8) return null;
    const { face, faceSize, backY, skinY, personY } = stats;
    if (!Array.isArray(face) || face.length !== 2 || !face.every(finite) || ![faceSize, backY, skinY, personY].every(finite)) return null;
    const data = bytes.slice(4 + length, 4 + length + n * 4);
    const matte = new Float32Array(n);
    for (let i = 0; i < n; i++) matte[i] = data[i * 4] / 255;
    const long = Math.max(gw, gh);
    const glowSmall = softBlur(matte, gw, gh, long * GLOW_SMALL);
    const glowWide = softBlur(matte, gw, gh, long * GLOW_WIDE);
    const field = new Float32Array(n * 4);
    let at = 4 + length + n * 4;
    const k = DEPTH_TOP / 65535;
    for (let i = 0; i < n; i++) {
      field[i * 4] = view.getUint16(at) * k;
      field[i * 4 + 1] = view.getUint16(at + 2) * k;
      field[i * 4 + 2] = glowSmall[i];
      field[i * 4 + 3] = glowWide[i];
      at += 4;
    }
    return { w: gw, h: gh, data, field, stats: { face: [face[0], face[1]], faceSize: faceSize!, backY: backY!, skinY: skinY!, personY: personY! } };
  } catch {
    return null;
  }
}
