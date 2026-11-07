/** Crop, rotation and flip math. All transforms are affine and shared by preview and export. */

export interface Crop {
  /** Fine rotation in degrees (straighten). */
  angle: number;
  /** Quarter turns clockwise, 0 to 3. */
  quarter: number;
  flipH: boolean;
  flipV: boolean;
  /** Crop center, in pixels, relative to the image center in the rotated frame. */
  cx: number;
  cy: number;
  /** Crop size in pixels in the rotated frame. */
  cw: number;
  ch: number;
}

/** Row-major 3x3 affine matrix. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

export function defaultCrop(w: number, h: number): Crop {
  return { angle: 0, quarter: 0, flipH: false, flipV: false, cx: 0, cy: 0, cw: w, ch: h };
}

export function rotationRad(c: Pick<Crop, 'angle' | 'quarter'>): number {
  return ((c.quarter * 90 + c.angle) * Math.PI) / 180;
}

export function mulMat3(a: Mat3, b: Mat3): Mat3 {
  const r = new Array<number>(9).fill(0) as Mat3;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    }
  }
  return r;
}

export function invertAffine(m: Mat3): Mat3 {
  const [a, b, c, d, e, f] = m;
  const det = a * e - b * d;
  const ia = e / det;
  const ib = -b / det;
  const id = -d / det;
  const ie = a / det;
  return [ia, ib, -(ia * c + ib * f), id, ie, -(id * c + ie * f), 0, 0, 1];
}

export function applyMat3(m: Mat3, x: number, y: number): [number, number] {
  return [m[0] * x + m[1] * y + m[2], m[3] * x + m[4] * y + m[5]];
}

/** Maps output coordinates (s, t in 0..1 over the crop) to image UV. */
export function outputToImage(c: Crop, w: number, h: number): Mat3 {
  const t = rotationRad(c);
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const fx = c.flipH ? -1 : 1;
  const fy = c.flipV ? -1 : 1;
  // Output to rotated frame.
  const toRot: Mat3 = [c.cw, 0, c.cx - c.cw / 2, 0, c.ch, c.cy - c.ch / 2, 0, 0, 1];
  // Rotated frame to image pixels, relative to the center: flip after the inverse rotation.
  const unrot: Mat3 = [fx * cos, fx * sin, 0, -fy * sin, fy * cos, 0, 0, 0, 1];
  // Centered pixels to UV.
  const toUv: Mat3 = [1 / w, 0, 0.5, 0, 1 / h, 0.5, 0, 0, 1];
  return mulMat3(toUv, mulMat3(unrot, toRot));
}

export function imageToOutput(c: Crop, w: number, h: number): Mat3 {
  return invertAffine(outputToImage(c, w, h));
}

/** Size of the axis-aligned box that holds the rotated image. */
export function rotatedBounds(w: number, h: number, c: Pick<Crop, 'angle' | 'quarter'>) {
  const t = rotationRad(c);
  const cos = Math.abs(Math.cos(t));
  const sin = Math.abs(Math.sin(t));
  return { w: w * cos + h * sin, h: w * sin + h * cos };
}

/** True when a crop rectangle lies inside the rotated image. */
export function cropInside(c: Crop, w: number, h: number, eps = 0.5): boolean {
  const m = outputToImage(c, w, h);
  for (const [s, t] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ] as const) {
    const [u, v] = applyMat3(m, s, t);
    if (u * w < -eps || u * w > w + eps || v * h < -eps || v * h > h + eps) return false;
  }
  return true;
}

/** Largest rectangle with the given aspect, centered on the image, inside the rotated image. */
export function largestInscribed(
  w: number,
  h: number,
  c: Pick<Crop, 'angle' | 'quarter'>,
  aspect: number,
): { cw: number; ch: number } {
  const t = rotationRad(c);
  const cos = Math.abs(Math.cos(t));
  const sin = Math.abs(Math.sin(t));
  // A centered rectangle (a, b) rotated by t fits when
  // a*cos + b*sin <= w and a*sin + b*cos <= h. With a = aspect * b, solve for b.
  const b = Math.min(w / (aspect * cos + sin), h / (aspect * sin + cos));
  return { cw: aspect * b, ch: b };
}

/** Shrinks and moves a crop until it fits the rotated image, keeping its aspect ratio. */
export function constrainCrop(c: Crop, w: number, h: number): Crop {
  const next = { ...c };
  const max = largestInscribed(w, h, c, c.cw / c.ch);
  if (next.cw > max.cw) {
    next.cw = max.cw;
    next.ch = max.ch;
  }
  if (cropInside(next, w, h)) return next;
  // Pull the center toward the origin until the rectangle fits.
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const test = { ...next, cx: c.cx * mid, cy: c.cy * mid };
    if (cropInside(test, w, h)) lo = mid;
    else hi = mid;
  }
  return { ...next, cx: c.cx * lo, cy: c.cy * lo };
}

export function outputSize(c: Crop): { w: number; h: number } {
  return { w: Math.max(1, Math.round(c.cw)), h: Math.max(1, Math.round(c.ch)) };
}

/** Bounds, in image pixels, of the source area that a part of the output needs. */
export function sourceBounds(
  c: Crop,
  w: number,
  h: number,
  s0: number,
  t0: number,
  s1: number,
  t1: number,
): { x0: number; y0: number; x1: number; y1: number } {
  const m = outputToImage(c, w, h);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [s, t] of [
    [s0, t0],
    [s1, t0],
    [s0, t1],
    [s1, t1],
  ] as const) {
    const [u, v] = applyMat3(m, s, t);
    x0 = Math.min(x0, u * w);
    y0 = Math.min(y0, v * h);
    x1 = Math.max(x1, u * w);
    y1 = Math.max(y1, v * h);
  }
  return { x0, y0, x1, y1 };
}
