/** CPU analysis for the healing brush. Works on small RGBA patches read from the GPU. */

export interface Patch {
  data: Uint8Array;
  w: number;
  h: number;
}

const lum = (p: Patch, i: number) => (0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2]) / 255;
const redness = (p: Patch, i: number) => (p.data[i] - p.data[i + 1]) / 255;

export interface Spot {
  x: number;
  y: number;
  r: number;
}

/**
 * Finds a small blemish near the center of a patch. The background is estimated from a ring near
 * the patch border; a pixel stands out when its lightness or redness departs from it.
 * Returns the region around the strongest pixel close to the center, or null when skin looks even.
 */
export function findBlemish(p: Patch, searchRadius: number): Spot | null {
  const { w, h } = p;
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const ringIn = Math.min(w, h) * 0.38;
  const ringOut = Math.min(w, h) * 0.5;
  const lums: number[] = [];
  const reds: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d >= ringIn && d <= ringOut) {
        const i = (y * w + x) * 4;
        lums.push(lum(p, i));
        reds.push(redness(p, i));
      }
    }
  }
  if (!lums.length) return null;
  const median = (a: number[]) => a.sort((m, n) => m - n)[a.length >> 1];
  const bgL = median(lums);
  const bgR = median(reds);

  const dev = new Float32Array(w * h);
  let peak = 0;
  let px = -1;
  let py = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const v = Math.abs(lum(p, i) - bgL) + 1.6 * Math.abs(redness(p, i) - bgR);
      dev[y * w + x] = v;
      if (Math.hypot(x - cx, y - cy) <= searchRadius && v > peak) {
        peak = v;
        px = x;
        py = y;
      }
    }
  }
  if (peak < 0.05 || px < 0) return null;

  // Grow from the peak over connected pixels that stand out.
  const threshold = Math.max(0.025, peak * 0.28);
  const seen = new Uint8Array(w * h);
  const stack = [py * w + px];
  seen[stack[0]] = 1;
  let sx = 0;
  let sy = 0;
  let area = 0;
  let far = 0;
  while (stack.length) {
    const idx = stack.pop()!;
    const x = idx % w;
    const y = (idx / w) | 0;
    sx += x;
    sy += y;
    area++;
    far = Math.max(far, Math.hypot(x - px, y - py));
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const n = ny * w + nx;
      if (!seen[n] && dev[n] >= threshold) {
        seen[n] = 1;
        stack.push(n);
      }
    }
  }
  // A region that runs far from the touch is an edge or a shadow, not a blemish.
  if (far > Math.min(Math.min(w, h) * 0.42, searchRadius * 1.6)) return null;
  // Blemishes fade out; cover the halo too, or it stays behind as a ring.
  const r = Math.sqrt(area / Math.PI) * 1.9 + 1.5;
  return { x: sx / area, y: sy / area, r };
}

/** True when a strong contour crosses the brush, such as hair over skin. Healing there smears it. */
export function hasStrongEdge(p: Patch, radius: number): boolean {
  const { w, h } = p;
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  let lo = 1;
  let hi = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (Math.hypot(x - cx, y - cy) > radius) continue;
      const v = lum(p, (y * w + x) * 4);
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  }
  return hi - lo > 0.22;
}

/**
 * Chooses where to borrow texture from. Candidates sit on rings around the target and are scored
 * by how well their surroundings match the target's ring, and by how calm their inside is, so
 * another blemish or an edge is not copied. Returns an offset in patch pixels.
 */
export function pickOffset(p: Patch, cx: number, cy: number, r: number): { dx: number; dy: number } {
  const { w, h } = p;
  const SAMPLES = 20;
  const ring = (x: number, y: number, radius: number) => {
    const out = new Float32Array(SAMPLES);
    let mean = 0;
    for (let i = 0; i < SAMPLES; i++) {
      const a = (i / SAMPLES) * Math.PI * 2;
      const sx = Math.round(x + Math.cos(a) * radius);
      const sy = Math.round(y + Math.sin(a) * radius);
      const v = lum(p, (Math.min(h - 1, Math.max(0, sy)) * w + Math.min(w - 1, Math.max(0, sx))) * 4);
      out[i] = v;
      mean += v;
    }
    mean /= SAMPLES;
    for (let i = 0; i < SAMPLES; i++) out[i] -= mean;
    return out;
  };
  const roughness = (x: number, y: number, radius: number) => {
    let sum = 0;
    let n = 0;
    const step = Math.max(1, Math.floor(radius / 5));
    for (let dy = -radius; dy <= radius; dy += step) {
      for (let dx = -radius; dx <= radius; dx += step) {
        if (dx * dx + dy * dy > radius * radius) continue;
        const sx = Math.round(x + dx);
        const sy = Math.round(y + dy);
        if (sx < 1 || sy < 1 || sx >= w - 1 || sy >= h - 1) continue;
        const i = (sy * w + sx) * 4;
        const gx = lum(p, i + 4) - lum(p, i - 4);
        const gy = lum(p, i + w * 4) - lum(p, i - w * 4);
        sum += Math.abs(gx) + Math.abs(gy);
        n++;
      }
    }
    return n ? sum / n : 1;
  };

  const target = ring(cx, cy, r * 1.25);
  let best = { dx: r * 2.4, dy: 0 };
  let bestScore = Infinity;
  for (const dist of [2.2, 3, 3.9]) {
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const dx = Math.cos(a) * r * dist;
      const dy = Math.sin(a) * r * dist;
      const x = cx + dx;
      const y = cy + dy;
      if (x - r < 0 || y - r < 0 || x + r >= w || y + r >= h) continue;
      const cand = ring(x, y, r * 1.25);
      let diff = 0;
      for (let i = 0; i < SAMPLES; i++) diff += Math.abs(cand[i] - target[i]);
      const score = diff / SAMPLES + roughness(x, y, r) * 1.2 + dist * 0.002;
      if (score < bestScore) {
        bestScore = score;
        best = { dx, dy };
      }
    }
  }
  return best;
}
