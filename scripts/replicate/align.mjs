/**
 * Finds where each pixel of the "after" photo sits in the "before" photo, as an affine map. A filtered export
 * is often a little smaller, cropped or shifted. Correlation is used because it does not care about gain and
 * offset, so a change of tone does not get in the way. A coarse search handles crops, then the enhanced
 * correlation coefficient method refines the map on larger and larger copies.
 */

import { lumaOf, shrink } from './image.mjs';

const COARSE_SIDE = 80;
const ZOOMS = [1, 0.95, 1.05, 0.9, 1.1, 0.85, 1.18, 0.78, 1.28, 0.7, 1.4, 0.62, 1.6];
const REFINE_SIDES = [160, 320, 640, 1200];
const ITERATIONS = 14;
/** At this correlation the two photos are already on top of each other, at a coarse look. */
const ALREADY_THERE = 0.985;

const smaller = (img, side) => {
  const k = Math.min(1, side / Math.max(img.w, img.h));
  const w = Math.max(8, Math.round(img.w * k));
  const h = Math.max(8, Math.round(img.h * k));
  return { w, h, luma: lumaOf(shrink(img, w, h)) };
};

function bilinear(l, x, y) {
  if (x < 0 || y < 0 || x > l.w - 1 || y > l.h - 1) return NaN;
  const ix = Math.min(Math.floor(x), l.w - 2);
  const iy = Math.min(Math.floor(y), l.h - 2);
  const fx = x - ix;
  const fy = y - iy;
  const p = iy * l.w + ix;
  const v = l.luma;
  return (v[p] * (1 - fx) + v[p + 1] * fx) * (1 - fy) + (v[p + l.w] * (1 - fx) + v[p + l.w + 1] * fx) * fy;
}

/** Correlation between `after` and `before` seen through the map. Pixels that fall outside do not count. */
function correlate(after, before, A, stride = 1) {
  let n = 0;
  let sa = 0;
  let sb = 0;
  let saa = 0;
  let sbb = 0;
  let sab = 0;
  for (let y = 0; y < after.h; y += stride) {
    for (let x = 0; x < after.w; x += stride) {
      const b = bilinear(before, A[0] * x + A[1] * y + A[2], A[3] * x + A[4] * y + A[5]);
      if (Number.isNaN(b)) continue;
      const a = after.luma[y * after.w + x];
      n++;
      sa += a;
      sb += b;
      saa += a * a;
      sbb += b * b;
      sab += a * b;
    }
  }
  // Too little overlap can correlate well by chance.
  if (n < (after.w * after.h) / (stride * stride) / 3) return -1;
  const da = saa - (sa * sa) / n;
  const db = sbb - (sb * sb) / n;
  return da > 0 && db > 0 ? (sab - (sa * sb) / n) / Math.sqrt(da * db) : -1;
}

function coarseSearch(after, before) {
  // `fit` is the scale that takes the after grid onto the before grid when they frame the same scene.
  const fit = (before.w / after.w + before.h / after.h) / 2;
  let best = { score: -1, A: null };
  for (const zoom of ZOOMS) {
    const k = fit * zoom;
    const spanX = before.w - after.w * k;
    const spanY = before.h - after.h * k;
    const reachX = Math.ceil(Math.abs(spanX)) + 2;
    const reachY = Math.ceil(Math.abs(spanY)) + 2;
    for (let ty = Math.min(spanY, 0) - 2; ty <= Math.max(spanY, 0) + 2; ty += Math.max(1, reachY / 24)) {
      for (let tx = Math.min(spanX, 0) - 2; tx <= Math.max(spanX, 0) + 2; tx += Math.max(1, reachX / 24)) {
        const A = [k, 0, tx, 0, k, ty];
        const score = correlate(after, before, A);
        if (score > best.score) best = { score, A };
      }
    }
  }
  return best;
}

/** Solves H x = b by Gaussian elimination, for the small symmetric system of the refinement. */
function solve(H, b) {
  const n = b.length;
  const M = H.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let pivot = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[pivot][c])) pivot = r;
    [M[c], M[pivot]] = [M[pivot], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) return null;
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let v = M[r][n];
    for (let k = r + 1; k < n; k++) v -= M[r][k] * x[k];
    x[r] = v / M[r][r];
  }
  return x;
}

/** One level of refinement. Coordinates of the after grid are centered and scaled so all six terms weigh alike. */
function refine(after, before, start) {
  const A = [...start];
  const cx = (after.w - 1) / 2;
  const cy = (after.h - 1) / 2;
  const unit = Math.max(cx, cy, 1);
  for (let iter = 0; iter < ITERATIONS; iter++) {
    const H = Array.from({ length: 6 }, () => new Array(6).fill(0));
    const gi = new Array(6).fill(0);
    const gt = new Array(6).fill(0);
    // The gradients have no reason to have a zero mean, so the means come out of the products.
    const sg = new Array(6).fill(0);
    let n = 0;
    let si = 0;
    let st = 0;
    let sii = 0;
    let sit = 0;
    for (let y = 1; y < after.h - 1; y++) {
      for (let x = 1; x < after.w - 1; x++) {
        const bx = A[0] * x + A[1] * y + A[2];
        const by = A[3] * x + A[4] * y + A[5];
        const i0 = bilinear(before, bx, by);
        const ix = (bilinear(before, bx + 1, by) - bilinear(before, bx - 1, by)) / 2;
        const iy = (bilinear(before, bx, by + 1) - bilinear(before, bx, by - 1)) / 2;
        if (Number.isNaN(i0) || Number.isNaN(ix) || Number.isNaN(iy)) continue;
        const t0 = after.luma[y * after.w + x];
        const u = (x - cx) / unit;
        const v = (y - cy) / unit;
        const g = [u * ix, v * ix, ix, u * iy, v * iy, iy];
        for (let r = 0; r < 6; r++) {
          for (let c = r; c < 6; c++) H[r][c] += g[r] * g[c];
          gi[r] += g[r] * i0;
          gt[r] += g[r] * t0;
          sg[r] += g[r];
        }
        n++;
        si += i0;
        st += t0;
        sii += i0 * i0;
        sit += i0 * t0;
      }
    }
    if (n < 64) break;
    for (let r = 0; r < 6; r++) for (let c = 0; c < r; c++) H[r][c] = H[c][r];
    const mi = si / n;
    const mt = st / n;
    const gI = gi.map((g, r) => g - sg[r] * mi);
    const gT = gt.map((g, r) => g - sg[r] * mt);
    const hi = solve(H, gI);
    const ht = solve(H, gT);
    if (!hi || !ht) break;
    const iProj = gI.reduce((s, g, r) => s + g * hi[r], 0);
    const tProj = gT.reduce((s, g, r) => s + g * hi[r], 0);
    const izz = sii - n * mi * mi;
    const itz = sit - n * mi * mt;
    const denom = itz - tProj;
    if (denom <= 0) break;
    const lambda = (izz - iProj) / denom;
    const dp = hi.map((h, r) => lambda * ht[r] - h);
    const step = Math.max(...dp.map(Math.abs));
    // The terms were found in centered coordinates, so they go back to plain pixels here.
    A[0] += dp[0] / unit;
    A[1] += dp[1] / unit;
    A[2] += dp[2] - (dp[0] * cx + dp[1] * cy) / unit;
    A[3] += dp[3] / unit;
    A[4] += dp[4] / unit;
    A[5] += dp[5] - (dp[3] * cx + dp[4] * cy) / unit;
    if (step < 0.002) break;
  }
  return A;
}

/** The map from pixels of `after` to pixels of `before`, with how well the two agree through it (0..1). */
export function alignImages(before, after) {
  const smallAfter = smaller(after, COARSE_SIDE);
  const smallBefore = smaller(before, COARSE_SIDE * Math.max(before.w, before.h) / Math.max(after.w, after.h));
  const fitX = smallBefore.w / smallAfter.w;
  const fitY = smallBefore.h / smallAfter.h;
  let coarse = [fitX, 0, 0, 0, fitY, 0];
  if (correlate(smallAfter, smallBefore, coarse) < ALREADY_THERE) {
    const found = coarseSearch(smallAfter, smallBefore);
    if (found.score > correlate(smallAfter, smallBefore, coarse)) coarse = found.A;
  }
  // From the coarse grids to plain pixels: `after` pixel to its coarse copy, to the coarse `before`, to `before`.
  const toFull = (l, full) => [full.w / l.w, full.h / l.h];
  const [ax, ay] = toFull(smallAfter, after);
  const [bx, by] = toFull(smallBefore, before);
  let A = [(coarse[0] * bx) / ax, (coarse[1] * bx) / ay, coarse[2] * bx, (coarse[3] * by) / ax, (coarse[4] * by) / ay, coarse[5] * by];
  for (const side of REFINE_SIDES) {
    const levelAfter = smaller(after, side);
    const k = Math.min(1, side / Math.max(after.w, after.h));
    const levelBefore = smaller(before, Math.max(before.w, before.h) * k * Math.max(A[0], A[4], 0.2) ** -1);
    const sax = after.w / levelAfter.w;
    const say = after.h / levelAfter.h;
    const sbx = before.w / levelBefore.w;
    const sby = before.h / levelBefore.h;
    const local = [(A[0] * sax) / sbx, (A[1] * say) / sbx, A[2] / sbx, (A[3] * sax) / sby, (A[4] * say) / sby, A[5] / sby];
    const next = refine(levelAfter, levelBefore, local);
    A = [(next[0] * sbx) / sax, (next[1] * sbx) / say, next[2] * sbx, (next[3] * sby) / sax, (next[4] * sby) / say, next[5] * sby];
    if (Math.max(after.w, after.h) <= side) break;
  }
  const check = smaller(after, 400);
  const checkBefore = smaller(before, 400 * Math.max(before.w, before.h) / Math.max(after.w, after.h));
  const cx = after.w / check.w;
  const cy = after.h / check.h;
  const dx = before.w / checkBefore.w;
  const dy = before.h / checkBefore.h;
  const score = correlate(check, checkBefore, [(A[0] * cx) / dx, (A[1] * cy) / dx, A[2] / dx, (A[3] * cx) / dy, (A[4] * cy) / dy, A[5] / dy]);
  return { map: A, score };
}
