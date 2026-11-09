/**
 * The background behind a person, for what shows up when a person gets smaller. Nothing knows those pixels, so
 * this is an honest guess: the colors around the person flow in smoothly, as a membrane stretched over the
 * hole, and the fine texture of the background next to the hole is mirrored into it, so a fill over asphalt or
 * a sheet does not look like a smooth patch. Plain arrays, so it can be tested without a GPU.
 *
 * Alpha says where the plate counts: the layer and a few cells around, for what an edge leaves on the pixels
 * next to it. Where the matte fades out slowly, as the shadow of a head on a neck, alpha fades with it, so the
 * photo gives way to the guess only as far as the layer really was there. Everywhere else alpha is zero, and
 * that is what keeps the background out of every warp.
 */

/**
 * A cell of the matte above this is the layer for sure, and one at or below the second has nothing of it. A
 * value from 1 to the third is a trace: nothing of the layer, but ground the plate has to clear, as the loose
 * ends around hair. See `TRACE` in `person.ts`.
 */
const SOLID_LEVEL = 127;
const PERSON_LEVEL = 8;
const TRACE_FULL = 4;
/** Room kept around a layer, as a share of the long side and in cells. */
const ROOM_SHARE = 0.0025;
const ROOM_MIN = 2;
/** Over this many cells at the outer side of that room, the plate gives way to the photo. */
const SOFT_CELLS = 2;
/** Rounds of relaxation at the coarsest level and at each finer one. */
const COARSE_ROUNDS = 60;
const FINE_ROUNDS = 8;
/** The level where the membrane starts, in cells of its long side. */
const COARSEST = 8;
/** The fine texture is what is left after a blur of this share of the long side, and at least this many cells. */
const DETAIL_SHARE = 0.004;
const DETAIL_MIN = 2;
/**
 * Texture is the small differences a photo has all over. What goes past some times the usual difference of this
 * photo stays out, down to a minimum: a letter of a caption or a strand of hair should not be mirrored into the
 * fill. On a plain wall the usual difference is close to nothing, and on asphalt it is large.
 */
const DETAIL_TIMES = 3;
const DETAIL_MIN_LIMIT = 3;
const DETAIL_MAX_LIMIT = 26;
/** The fade starts at this share of the limit. */
const DETAIL_SOFT = 0.4;

/** For each cell, the cell of `seed` nearest to it, as an index, or -1 when there is none. */
export function nearestCells(seed: Uint8Array, w: number, h: number): Int32Array {
  const near = new Int32Array(w * h).fill(-1);
  const dist = new Float64Array(w * h).fill(Infinity);
  for (let i = 0; i < seed.length; i++) {
    if (!seed[i]) continue;
    near[i] = i;
    dist[i] = 0;
  }
  const look = (x: number, y: number, dx: number, dy: number) => {
    const xx = x + dx;
    const yy = y + dy;
    if (xx < 0 || yy < 0 || xx >= w || yy >= h) return;
    const from = near[yy * w + xx];
    if (from < 0) return;
    const fx = from % w;
    const fy = (from - fx) / w;
    const d = (fx - x) * (fx - x) + (fy - y) * (fy - y);
    const at = y * w + x;
    if (d < dist[at]) {
      dist[at] = d;
      near[at] = from;
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
  return near;
}

interface Level {
  w: number;
  h: number;
  color: Float32Array;
  known: Uint8Array;
}

function halve(level: Level): Level {
  const w = Math.max(1, Math.ceil(level.w / 2));
  const h = Math.max(1, Math.ceil(level.h / 2));
  const color = new Float32Array(w * h * 3);
  const weight = new Float32Array(w * h);
  for (let y = 0; y < level.h; y++) {
    const gy = y >> 1;
    for (let x = 0; x < level.w; x++) {
      const at = y * level.w + x;
      if (!level.known[at]) continue;
      const to = gy * w + (x >> 1);
      weight[to]++;
      for (let c = 0; c < 3; c++) color[to * 3 + c] += level.color[at * 3 + c];
    }
  }
  const known = new Uint8Array(w * h);
  for (let i = 0; i < weight.length; i++) {
    if (!weight[i]) continue;
    known[i] = 1;
    for (let c = 0; c < 3; c++) color[i * 3 + c] /= weight[i];
  }
  return { w, h, color, known };
}

/** Evens out what is not known, a few rounds, in place. Known cells hold the membrane down. */
function relax({ w, h, color, known }: Level, rounds: number): void {
  // In a chessboard order and a little past the plain average, which settles in far fewer rounds.
  const over = 1.6;
  for (let round = 0; round < rounds; round++) {
    for (const parity of [0, 1]) {
      for (let y = 0; y < h; y++) {
        for (let x = (y + parity) & 1; x < w; x += 2) {
          const at = y * w + x;
          if (known[at]) continue;
          const left = x > 0 ? at - 1 : at;
          const right = x < w - 1 ? at + 1 : at;
          const up = y > 0 ? at - w : at;
          const down = y < h - 1 ? at + w : at;
          for (let c = 0; c < 3; c++) {
            const mean = (color[left * 3 + c] + color[right * 3 + c] + color[up * 3 + c] + color[down * 3 + c]) / 4;
            color[at * 3 + c] += (mean - color[at * 3 + c]) * over;
          }
        }
      }
    }
  }
}

/** Fills in what is not known with the membrane, from coarse to fine. */
function membrane(top: Level): void {
  const levels = [top];
  while (Math.max(levels[levels.length - 1].w, levels[levels.length - 1].h) > COARSEST) levels.push(halve(levels[levels.length - 1]));
  const last = levels[levels.length - 1];
  // At the coarsest level, unknown cells start from the average.
  const mean = [0, 0, 0];
  let count = 0;
  for (let i = 0; i < last.known.length; i++) {
    if (!last.known[i]) continue;
    count++;
    for (let c = 0; c < 3; c++) mean[c] += last.color[i * 3 + c];
  }
  for (let i = 0; i < last.known.length; i++) {
    if (last.known[i]) continue;
    for (let c = 0; c < 3; c++) last.color[i * 3 + c] = mean[c] / Math.max(count, 1);
  }
  relax(last, COARSE_ROUNDS);
  for (let n = levels.length - 2; n >= 0; n--) {
    const fine = levels[n];
    const coarse = levels[n + 1];
    for (let y = 0; y < fine.h; y++) {
      const gy = Math.min(coarse.h - 1, Math.max(0, (y + 0.5) / 2 - 0.5));
      const y0 = Math.floor(gy);
      const y1 = Math.min(coarse.h - 1, y0 + 1);
      const ty = gy - y0;
      for (let x = 0; x < fine.w; x++) {
        const at = y * fine.w + x;
        if (fine.known[at]) continue;
        const gx = Math.min(coarse.w - 1, Math.max(0, (x + 0.5) / 2 - 0.5));
        const x0 = Math.floor(gx);
        const x1 = Math.min(coarse.w - 1, x0 + 1);
        const tx = gx - x0;
        for (let c = 0; c < 3; c++) {
          const a = coarse.color[(y0 * coarse.w + x0) * 3 + c];
          const b = coarse.color[(y0 * coarse.w + x1) * 3 + c];
          const d = coarse.color[(y1 * coarse.w + x0) * 3 + c];
          const e = coarse.color[(y1 * coarse.w + x1) * 3 + c];
          fine.color[at * 3 + c] = (a + (b - a) * tx) * (1 - ty) + (d + (e - d) * tx) * ty;
        }
      }
    }
    relax(fine, FINE_ROUNDS);
  }
}

/**
 * A picture, as RGBA, with every cell that is not known replaced by the smooth guess of the known ones around
 * it. Alpha is 255 where it is a guess. For the model to carry on from one kind of thing only: what is not of
 * that kind is taken out first.
 */
export function spreadKnown(rgba: ArrayLike<number>, known: Uint8Array, w: number, h: number): Uint8Array {
  const n = w * h;
  const color = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) color[i * 3 + c] = known[i] ? rgba[i * 4 + c] : 0;
  if (known.some((v) => v > 0)) membrane({ w, h, color, known });
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.max(0, Math.min(255, Math.round(color[i * 3 + c])));
    out[i * 4 + 3] = known[i] ? 0 : 255;
  }
  return out;
}

/** The average of each channel over a square around each cell, counting only known cells. */
export function blurKnown(color: Float32Array, known: Uint8Array, w: number, h: number, r: number): Float32Array {
  const out = new Float32Array(color.length);
  const pass = (from: Float32Array, weight: Float32Array, to: Float32Array, toWeight: Float32Array, horizontal: boolean) => {
    const lines = horizontal ? h : w;
    const span = horizontal ? w : h;
    const step = horizontal ? 1 : w;
    const next = horizontal ? w : 1;
    for (let line = 0; line < lines; line++) {
      const start = line * next;
      const sum = [0, 0, 0, 0];
      for (let k = -r; k <= r; k++) {
        const at = start + Math.min(span - 1, Math.max(0, k)) * step;
        sum[3] += weight[at];
        for (let c = 0; c < 3; c++) sum[c] += from[at * 3 + c];
      }
      for (let i = 0; i < span; i++) {
        const at = start + i * step;
        toWeight[at] = sum[3];
        for (let c = 0; c < 3; c++) to[at * 3 + c] = sum[c];
        const add = start + Math.min(span - 1, i + r + 1) * step;
        const drop = start + Math.max(0, i - r) * step;
        sum[3] += weight[add] - weight[drop];
        for (let c = 0; c < 3; c++) sum[c] += from[add * 3 + c] - from[drop * 3 + c];
      }
    }
  };
  const n = w * h;
  const startColor = new Float32Array(n * 3);
  const startWeight = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (!known[i]) continue;
    startWeight[i] = 1;
    for (let c = 0; c < 3; c++) startColor[i * 3 + c] = color[i * 3 + c];
  }
  const midColor = new Float32Array(n * 3);
  const midWeight = new Float32Array(n);
  const endWeight = new Float32Array(n);
  pass(startColor, startWeight, midColor, midWeight, true);
  pass(midColor, midWeight, out, endWeight, false);
  for (let i = 0; i < n; i++) {
    if (endWeight[i] <= 0) continue;
    for (let c = 0; c < 3; c++) out[i * 3 + c] /= endWeight[i];
  }
  return out;
}

/**
 * The plate, as RGBA bytes on the grid of the matte. `rgba` is the photo on that same grid. A photo that is all
 * person has no background to go on, and its plate has no alpha anywhere: warps then show the photo.
 */
export function buildPlate(rgba: ArrayLike<number>, matte: Uint8Array, w: number, h: number): Uint8Array {
  const n = w * h;
  const out = new Uint8Array(n * 4);
  const person = new Uint8Array(n);
  let any = false;
  for (let i = 0; i < n; i++) {
    if (matte[i] > SOLID_LEVEL) {
      person[i] = 1;
      any = true;
    }
  }
  if (!any) {
    for (let i = 0; i < n * 4; i += 4) {
      out[i] = rgba[i];
      out[i + 1] = rgba[i + 1];
      out[i + 2] = rgba[i + 2];
    }
    return out;
  }
  const room = Math.max(ROOM_MIN, Math.round(Math.max(w, h) * ROOM_SHARE));
  const toPerson = nearestCells(person, w, h);
  const known = new Uint8Array(n);
  const alpha = new Uint8Array(n);
  let knownCount = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const at = y * w + x;
      const from = toPerson[at];
      const fx = from % w;
      const fy = (from - fx) / w;
      const d = Math.hypot(fx - x, fy - y);
      // Past the room around the solid part, the plate counts as much as the matte still does.
      const t = Math.min(1, Math.max(0, (matte[at] - PERSON_LEVEL) / (SOLID_LEVEL - PERSON_LEVEL)));
      const faint = matte[at] > PERSON_LEVEL ? Math.round(255 * t * t * (3 - 2 * t)) : Math.round(255 * Math.min(1, matte[at] / TRACE_FULL));
      const near = d > room + SOFT_CELLS ? 0 : d <= room ? 255 : Math.round(255 * (1 - (d - room) / (SOFT_CELLS + 1)));
      alpha[at] = Math.max(faint, near);
      if (!alpha[at]) {
        known[at] = 1;
        knownCount++;
      }
    }
  }
  if (!knownCount) {
    for (let i = 0; i < n * 4; i += 4) {
      out[i] = rgba[i];
      out[i + 1] = rgba[i + 1];
      out[i + 2] = rgba[i + 2];
    }
    return out;
  }
  const photo = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) photo[i * 3 + c] = rgba[i * 4 + c];
  const color = photo.slice();
  membrane({ w, h, color, known });
  const soft = blurKnown(photo, known, w, h, Math.max(DETAIL_MIN, Math.round(Math.max(w, h) * DETAIL_SHARE)));
  const toBack = nearestCells(known, w, h);
  // The usual difference: half the known cells have less than this.
  const counts = new Uint32Array(256);
  let seen = 0;
  for (let i = 0; i < n; i += 2) {
    if (!known[i]) continue;
    counts[Math.min(255, Math.round(Math.abs(photo[i * 3 + 1] - soft[i * 3 + 1])))]++;
    seen++;
  }
  let usual = 0;
  for (let sum = 0; usual < 255 && sum + counts[usual] < seen / 2; usual++) sum += counts[usual];
  const hard = Math.min(DETAIL_MAX_LIMIT, Math.max(DETAIL_MIN_LIMIT, (usual + 0.5) * DETAIL_TIMES));
  const gentle = hard * DETAIL_SOFT;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const at = y * w + x;
      const o = at * 4;
      if (known[at]) {
        out[o] = rgba[o];
        out[o + 1] = rgba[o + 1];
        out[o + 2] = rgba[o + 2];
        continue;
      }
      // Mirrors across the nearest point of the background, as far as there is background to read.
      const from = toBack[at];
      const bx = from % w;
      const by = (from - bx) / w;
      let source = -1;
      for (const k of [1, 0.5, 0.25]) {
        const mx = Math.round(bx + (bx - x) * k);
        const my = Math.round(by + (by - y) * k);
        if (mx < 0 || my < 0 || mx >= w || my >= h) continue;
        const m = my * w + mx;
        if (known[m]) {
          source = m;
          break;
        }
      }
      let keep = 0;
      if (source >= 0) {
        let largest = 0;
        for (let c = 0; c < 3; c++) largest = Math.max(largest, Math.abs(photo[source * 3 + c] - soft[source * 3 + c]));
        keep = 1 - Math.min(1, Math.max(0, (largest - gentle) / (hard - gentle)));
      }
      for (let c = 0; c < 3; c++) {
        const detail = keep > 0 ? (photo[source * 3 + c] - soft[source * 3 + c]) * keep : 0;
        out[o + c] = Math.max(0, Math.min(255, Math.round(color[at * 3 + c] + detail)));
      }
      out[o + 3] = alpha[at];
    }
  }
  return out;
}

/**
 * Around each mouth, writes into a plate what is inside the mouth, carried on under the lips. Lips shaped by a
 * slider slide over the teeth, and where they uncover more than the photo shows, this is what appears: the
 * dark of a corner next to a corner, and tooth next to a tooth. `mouth` is the opening, `reach` how far around
 * it the lips can move, in cells. The inside itself keeps the color of the photo.
 */
export function extendMouth(plate: Uint8Array, rgba: ArrayLike<number>, mouth: Uint8Array, w: number, h: number, reach: number): void {
  const inside = new Uint8Array(w * h);
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mouth[y * w + x] < 128) continue;
      inside[y * w + x] = 1;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return;
  const r = Math.max(2, Math.ceil(reach));
  x0 = Math.max(0, x0 - r);
  y0 = Math.max(0, y0 - r);
  x1 = Math.min(w - 1, x1 + r);
  y1 = Math.min(h - 1, y1 + r);
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const color = new Float32Array(bw * bh * 3);
  const known = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const from = (y + y0) * w + x + x0;
      if (!inside[from]) continue;
      known[y * bw + x] = 1;
      for (let c = 0; c < 3; c++) color[(y * bw + x) * 3 + c] = rgba[from * 4 + c];
    }
  }
  const near = nearestCells(known, bw, bh);
  membrane({ w: bw, h: bh, color, known });
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const at = y * bw + x;
      const from = near[at];
      if (from < 0) continue;
      const fx = from % bw;
      const fy = (from - fx) / bw;
      if (Math.hypot(fx - x, fy - y) > r) continue;
      const to = ((y + y0) * w + x + x0) * 4;
      for (let c = 0; c < 3; c++) plate[to + c] = Math.max(0, Math.min(255, Math.round(color[at * 3 + c])));
    }
  }
}
