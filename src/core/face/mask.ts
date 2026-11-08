/**
 * Turns the outline of a face into a soft mask for the filter. Plain arrays and no browser APIs, so
 * every step can be tested. The result is only a shape: it holds nothing about who the person is.
 */

/** A point in image UV. */
export type Point = readonly [number, number];

export interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Share of the face height used by each step. Tuned on real photos with a black and white filter. */
const MARGIN = 0.4;
const MARGIN_BELOW = 1;
const FEATHER = 0.035;
const NECK_REACH = 0.42;
const REFINE_RADIUS = 0.05;
/** Variance of the photo below which an edge is treated as flat, for luma from 0 to 1. */
const REFINE_EPS = 0.0015;
/** Filled samples per pixel row. Enough, since the edge is softened right after. */
const ROWS_PER_PIXEL = 4;

export function bounds(points: readonly Point[]): Area {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of points) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Coverage of a polygon on a pixel grid, from 0 to 1. The polygon is in grid coordinates. */
export function fillPolygon(points: readonly Point[], w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  const crossings: number[] = [];
  const share = 1 / ROWS_PER_PIXEL;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let s = 0; s < ROWS_PER_PIXEL; s++) {
      const sy = y + (s + 0.5) * share;
      crossings.length = 0;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [ax, ay] = points[j];
        const [bx, by] = points[i];
        if (ay <= sy !== by <= sy) crossings.push(ax + ((sy - ay) / (by - ay)) * (bx - ax));
      }
      crossings.sort((a, b) => a - b);
      for (let c = 0; c + 1 < crossings.length; c += 2) {
        const from = Math.max(0, crossings[c]);
        const to = Math.min(w, crossings[c + 1]);
        for (let x = Math.floor(from); x < to; x++) {
          out[row + x] += (Math.min(to, x + 1) - Math.max(from, x)) * share;
        }
      }
    }
  }
  return out;
}

/** One box blur along a line of pixels, with the edge value repeated past the end. */
function boxLine(src: Float32Array, dst: Float32Array, start: number, stride: number, n: number, r: number): void {
  const at = (i: number) => src[start + Math.min(n - 1, Math.max(0, i)) * stride];
  let sum = 0;
  for (let i = -r; i <= r; i++) sum += at(i);
  const k = 1 / (2 * r + 1);
  for (let i = 0; i < n; i++) {
    dst[start + i * stride] = sum * k;
    sum += at(i + r + 1) - at(i - r);
  }
}

export function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r < 1) return src.slice();
  const across = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) boxLine(src, across, y * w, 1, w, r);
  for (let x = 0; x < w; x++) boxLine(across, out, x, w, h, r);
  return out;
}

/** Three box blurs come close to a Gaussian with this standard deviation. */
export function softBlur(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  const r = Math.round(sigma * 0.95);
  return boxBlur(boxBlur(boxBlur(src, w, h, r), w, h, r), w, h, r);
}

/**
 * Pulls the soft edge of `mask` toward the edges of `guide`, the luma of the photo.
 * Where the photo is flat the mask stays as it is, so skin does not pick up noise.
 */
export function guidedFilter(guide: Float32Array, mask: Float32Array, w: number, h: number, r: number, eps: number): Float32Array {
  const n = guide.length;
  const guideSquared = new Float32Array(n);
  const product = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    guideSquared[i] = guide[i] * guide[i];
    product[i] = guide[i] * mask[i];
  }
  const meanGuide = boxBlur(guide, w, h, r);
  const meanMask = boxBlur(mask, w, h, r);
  const meanSquared = boxBlur(guideSquared, w, h, r);
  const meanProduct = boxBlur(product, w, h, r);
  const a = new Float32Array(n);
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const variance = meanSquared[i] - meanGuide[i] * meanGuide[i];
    const covariance = meanProduct[i] - meanGuide[i] * meanMask[i];
    a[i] = covariance / (variance + eps);
    b[i] = meanMask[i] - a[i] * meanGuide[i];
  }
  const meanA = boxBlur(a, w, h, r);
  const meanB = boxBlur(b, w, h, r);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.min(1, Math.max(0, meanA[i] * guide[i] + meanB[i]));
  return out;
}

/** Lets the mask fade along a direction, so a strong filter leaves no cut under the chin. */
export function fadeAlong(src: Float32Array, w: number, h: number, dx: number, dy: number, reach: number): Float32Array {
  const out = src.slice();
  const steps = Math.max(1, Math.ceil(reach / 2));
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const weight = (1 - t) * (1 - t);
    const ox = Math.round(dx * reach * t);
    const oy = Math.round(dy * reach * t);
    for (let y = Math.max(0, oy); y < Math.min(h, h + oy); y++) {
      for (let x = Math.max(0, ox); x < Math.min(w, w + ox); x++) {
        const v = src[(y - oy) * w + (x - ox)] * weight;
        if (v > out[y * w + x]) out[y * w + x] = v;
      }
    }
  }
  return out;
}

/** Everything the mask needs from the outside: its size and the photo around the face. */
export interface MaskTarget {
  w: number;
  h: number;
  /** Luma of an area of the mask grid, row by row, from 0 to 1. */
  luma?(area: Area): Float32Array;
  /** Color of an area of the mask grid, row by row, four bytes per pixel (RGBA). */
  color?(area: Area): Uint8ClampedArray;
}

/**
 * Builds the full-size mask for one face.
 * `outline` runs around the face in image UV, starting at the top of the forehead. `chin` is the
 * point of that outline at the bottom of the chin, which also gives the direction of the neck.
 */
export function buildFaceMask(outline: readonly Point[], chin: number, target: MaskTarget): Uint8Array {
  const { w, h } = target;
  const grid = outline.map(([u, v]): Point => [u * w, v * h]);
  const box = bounds(grid);
  const size = Math.max(box.h, box.w, 1);

  const x0 = Math.max(0, Math.floor(box.x - size * MARGIN));
  const y0 = Math.max(0, Math.floor(box.y - size * MARGIN));
  const x1 = Math.min(w, Math.ceil(box.x + box.w + size * MARGIN));
  const y1 = Math.min(h, Math.ceil(box.y + box.h + size * MARGIN_BELOW));
  const area: Area = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  const out = new Uint8Array(w * h);
  if (area.w < 1 || area.h < 1) return out;

  let soft = fillPolygon(
    grid.map(([x, y]): Point => [x - area.x, y - area.y]),
    area.w,
    area.h,
  );
  const [topX, topY] = grid[0];
  const [chinX, chinY] = grid[chin];
  const length = Math.hypot(chinX - topX, chinY - topY) || 1;
  soft = fadeAlong(soft, area.w, area.h, (chinX - topX) / length, (chinY - topY) / length, size * NECK_REACH);
  soft = softBlur(soft, area.w, area.h, size * FEATHER);
  const guide = target.luma?.(area);
  if (guide) soft = guidedFilter(guide, soft, area.w, area.h, Math.max(1, Math.round(size * REFINE_RADIUS)), REFINE_EPS);

  for (let y = 0; y < area.h; y++) {
    for (let x = 0; x < area.w; x++) {
      out[(y + area.y) * w + x + area.x] = Math.round(Math.min(1, soft[y * area.w + x]) * 255);
    }
  }
  return out;
}
