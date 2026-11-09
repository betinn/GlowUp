/**
 * What can be read from a pair once it is aligned: the color error, the vignette, the grain, the tone curve,
 * and whether something in the photo happens in one place only, which no table can reproduce.
 */

import { rgbToLab } from '../../src/core/color.ts';
import { GRAIN_GAIN, grainNoise, grainWeight, vignetteOn, vignetteShape } from './finish.mjs';
import { boxBlur, luma, median, percentile } from './image.mjs';
import { lookup } from './lut.mjs';

/** CIEDE2000 between two Lab colors. */
export function deltaE2000(l1, a1, b1, l2, a2, b2) {
  const rad = Math.PI / 180;
  const c1 = Math.hypot(a1, b1);
  const c2 = Math.hypot(a2, b2);
  const cBar7 = ((c1 + c2) / 2) ** 7;
  const g = 0.5 * (1 - Math.sqrt(cBar7 / (cBar7 + 25 ** 7)));
  const ap1 = (1 + g) * a1;
  const ap2 = (1 + g) * a2;
  const cp1 = Math.hypot(ap1, b1);
  const cp2 = Math.hypot(ap2, b2);
  const hue = (a, b) => (a === 0 && b === 0 ? 0 : ((Math.atan2(b, a) / rad) % 360 + 360) % 360);
  const hp1 = hue(ap1, b1);
  const hp2 = hue(ap2, b2);
  const dL = l2 - l1;
  const dC = cp2 - cp1;
  let dh = 0;
  if (cp1 * cp2 !== 0) {
    dh = hp2 - hp1;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(cp1 * cp2) * Math.sin((dh / 2) * rad);
  const lBar = (l1 + l2) / 2;
  const cBar = (cp1 + cp2) / 2;
  let hBar = hp1 + hp2;
  if (cp1 * cp2 !== 0) {
    if (Math.abs(hp1 - hp2) <= 180) hBar = (hp1 + hp2) / 2;
    else hBar = hp1 + hp2 < 360 ? (hp1 + hp2 + 360) / 2 : (hp1 + hp2 - 360) / 2;
  }
  const t = 1 - 0.17 * Math.cos((hBar - 30) * rad) + 0.24 * Math.cos(2 * hBar * rad) + 0.32 * Math.cos((3 * hBar + 6) * rad) - 0.2 * Math.cos((4 * hBar - 63) * rad);
  const theta = 30 * Math.exp(-(((hBar - 275) / 25) ** 2));
  const rc = 2 * Math.sqrt(cBar ** 7 / (cBar ** 7 + 25 ** 7));
  const sl = 1 + (0.015 * (lBar - 50) ** 2) / Math.sqrt(20 + (lBar - 50) ** 2);
  const sc = 1 + 0.045 * cBar;
  const sh = 1 + 0.015 * cBar * t;
  const rt = -Math.sin(2 * theta * rad) * rc;
  return Math.sqrt((dL / sl) ** 2 + (dC / sc) ** 2 + (dH / sh) ** 2 + rt * (dC / sc) * (dH / sh));
}

/** Color error between two lists of RGB values. */
export function colorError(predicted, actual) {
  const n = predicted.length / 3;
  const errors = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = rgbToLab([predicted[i * 3], predicted[i * 3 + 1], predicted[i * 3 + 2]]);
    const q = rgbToLab([actual[i * 3], actual[i * 3 + 1], actual[i * 3 + 2]]);
    errors[i] = deltaE2000(p[0], p[1], p[2], q[0], q[1], q[2]);
  }
  let sum = 0;
  for (const e of errors) sum += e;
  return { mean: sum / Math.max(n, 1), median: median(errors), p95: percentile(errors, 0.95), max: percentile(errors, 0.999) };
}

/** Where a vignette has started to show, in the terms of its own shape. */
const VIGNETTE_FROM = 0.08;

/**
 * The vignette, read before the table exists. Samples of about the same input color are compared with each
 * other: if the ones nearer the corners came out darker, only position can explain it, however the filter moved
 * that color. Returns the amount on the -1..1 scale of the shader.
 */
export function measureVignette(input, output, shape) {
  const cells = new Map();
  const n = input.length / 3;
  for (let i = 0; i < n; i++) {
    // Only the outer part of the frame counts, so light on a face in the middle does not pass for a vignette.
    if (shape[i] < VIGNETTE_FROM) continue;
    const key = (Math.floor(input[i * 3] * 24) * 25 + Math.floor(input[i * 3 + 1] * 24)) * 25 + Math.floor(input[i * 3 + 2] * 24);
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(i);
  }
  let darkTop = 0;
  let darkBottom = 0;
  let lightTop = 0;
  let lightBottom = 0;
  for (const list of cells.values()) {
    if (list.length < 4) continue;
    let meanOut = 0;
    let meanS = 0;
    for (const i of list) {
      meanOut += luma(output[i * 3], output[i * 3 + 1], output[i * 3 + 2]);
      meanS += shape[i];
    }
    meanOut /= list.length;
    meanS /= list.length;
    if (meanOut < 0.02) continue;
    for (const i of list) {
      const dy = luma(output[i * 3], output[i * 3 + 1], output[i * 3 + 2]) - meanOut;
      const ds = shape[i] - meanS;
      // Darkening scales with the color; lightening with what is left up to white.
      darkTop += ds * (-dy / (0.85 * meanOut));
      darkBottom += ds * ds;
      const room = Math.max(1 - meanOut, 0.02);
      lightTop += ds * (dy / (0.7 * room));
      lightBottom += ds * ds;
    }
  }
  const dark = darkBottom > 0 ? darkTop / darkBottom : 0;
  const light = lightBottom > 0 ? lightTop / lightBottom : 0;
  return dark >= 0 ? Math.min(1, dark) : -Math.min(1, Math.max(0, light));
}

/** How much vignette the table could not explain, given the amount already taken out. Same scale as the amount. */
export function vignetteLeft(input, output, shape, lut, amount) {
  const c = [0, 0, 0];
  let top = 0;
  let bottom = 0;
  for (let i = 0; i < shape.length; i++) {
    if (shape[i] < VIGNETTE_FROM) continue;
    lookup(lut, input[i * 3], input[i * 3 + 1], input[i * 3 + 2], c);
    const predicted = vignetteOn(luma(c[0], c[1], c[2]), amount, shape[i]);
    const reach = 0.85 * predicted * shape[i];
    top += reach * (predicted - luma(output[i * 3], output[i * 3 + 1], output[i * 3 + 2]));
    bottom += reach * reach;
  }
  return bottom > 0 ? top / bottom : 0;
}

/** Noise a compressed file has by itself, on the 0..1 scale. */
const FILE_NOISE = 0.0018;
/** The same in a file resized after it was compressed. Grain weaker than this cannot be told from the file itself. */
const RESIZED_NOISE = 0.0035;

/** Relative strength of the app's noise after the same high-pass, on a frame of this size. */
function noiseStrength(w, h) {
  const side = 192;
  const x0 = Math.floor(w / 3);
  const y0 = Math.floor(h / 3);
  const tw = Math.min(side, w);
  const th = Math.min(side, h);
  const values = new Float32Array(tw * th);
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) values[y * tw + x] = grainNoise((x0 + x) / w, (y0 + y) / h);
  }
  const low = boxBlur(values, tw, th, 2);
  const high = values.map((v, i) => Math.abs(v - low[i]));
  return median(high) * 1.4826;
}

/**
 * The grain of `after`, on the scale of the panel. Only flat parts of the photo count, where a small misalignment
 * shows nothing, and only fine detail, after taking away the slow changes. With `sameGrid`, every pixel of `after`
 * sits on a pixel of `before`, so what the table predicts can be subtracted pixel by pixel and the grain stands
 * alone. On a resized photo that cannot be done, because resizing moves the noise around, and the most that can be
 * said is how much more fine detail `after` has than the prediction.
 */
export function measureGrain(aligned, after, predictAt, sameGrid) {
  const { w, h } = after;
  const predicted = new Float32Array(w * h);
  const actual = new Float32Array(w * h);
  const out = [0, 0, 0];
  for (let i = 0; i < w * h; i++) {
    predictAt(i, out);
    predicted[i] = luma(out[0], out[1], out[2]);
    actual[i] = luma(after.rgb[i * 3], after.rgb[i * 3 + 1], after.rgb[i * 3 + 2]);
  }
  const weighted = (values) => values.map((v, i) => v / grainWeight(Math.min(1, Math.max(0, actual[i]))));
  const highPass = (values) => {
    const low = boxBlur(values, w, h, 2);
    return values.map((v, i) => v - low[i]);
  };
  const smoothRough = boxBlur(highPass(predicted).map(Math.abs), w, h, 4);
  const flat = percentile(smoothRough.filter((_, i) => aligned.valid[i]), 0.4);
  const usable = (i) => aligned.valid[i] && smoothRough[i] <= flat && actual[i] >= 0.08 && actual[i] <= 0.95;
  const spread = (values) => {
    const list = [];
    for (let i = 0; i < w * h; i++) if (usable(i)) list.push(Math.abs(values[i]));
    return list.length < 200 ? null : median(list) * 1.4826;
  };
  const noise = noiseStrength(w, h) * GRAIN_GAIN;
  if (sameGrid) {
    const sigma = spread(highPass(weighted(actual.map((v, i) => v - predicted[i]))));
    if (sigma === null) return { grain: 0, sigma: 0 };
    // Below about half a level of 8 bits there is nothing to tell apart from the compression of the file.
    const clean = Math.sqrt(Math.max(0, sigma * sigma - FILE_NOISE ** 2));
    return { grain: (clean / noise) * 100, sigma: clean };
  }
  const a = spread(highPass(weighted(actual)));
  const p = spread(highPass(weighted(predicted)));
  if (a === null || p === null) return { grain: 0, sigma: 0 };
  const clean = Math.sqrt(Math.max(0, a * a - p * p - RESIZED_NOISE ** 2));
  return { grain: (clean / noise) * 100, sigma: clean };
}

/** Out by in, in sixteen steps of lightness and per channel. It is what the eye reads as the curve of the filter. */
export function measureToneCurve(input, output) {
  const steps = 16;
  const bins = Array.from({ length: steps }, () => ({ l: [], r: [], g: [], b: [] }));
  const n = input.length / 3;
  for (let i = 0; i < n; i++) {
    const inL = luma(input[i * 3], input[i * 3 + 1], input[i * 3 + 2]);
    const bin = bins[Math.min(steps - 1, Math.floor(inL * steps))];
    bin.l.push(luma(output[i * 3], output[i * 3 + 1], output[i * 3 + 2]));
    bin.r.push(output[i * 3]);
    bin.g.push(output[i * 3 + 1]);
    bin.b.push(output[i * 3 + 2]);
  }
  return bins.flatMap((bin, i) =>
    bin.l.length < 16 ? [] : [{ in: (i + 0.5) / steps, out: median(bin.l), r: median(bin.r), g: median(bin.g), b: median(bin.b), count: bin.l.length }],
  );
}

/** The biggest patch of connected true cells, with its bounding box as shares of the frame. */
function largestPatch(cells, w, h) {
  const seen = new Uint8Array(w * h);
  let best = { size: 0, box: null };
  const stack = [];
  for (let start = 0; start < w * h; start++) {
    if (!cells[start] || seen[start]) continue;
    let size = 0;
    let x0 = w;
    let y0 = h;
    let x1 = 0;
    let y1 = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const c = stack.pop();
      const x = c % w;
      const y = Math.floor(c / w);
      size++;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      for (const o of [x > 0 ? c - 1 : -1, x < w - 1 ? c + 1 : -1, y > 0 ? c - w : -1, y < h - 1 ? c + w : -1]) {
        if (o >= 0 && cells[o] && !seen[o]) {
          seen[o] = 1;
          stack.push(o);
        }
      }
    }
    if (size > best.size) best = { size, box: { left: x0 / w, top: y0 / h, right: (x1 + 1) / w, bottom: (y1 + 1) / h } };
  }
  return best;
}

/** Above this mean Lab distance a patch of the photo is off by something the eye sees. */
const LOCAL_COLOR_MIN = 2.5;
/** The patch must cover this share of the frame. Less is a small object, not lighting. */
const LOCAL_COLOR_AREA = 0.015;
/** A patch of detail has less than this share of the texture typical of the photo. */
const LOCAL_DETAIL_RATIO = 0.45;
const LOCAL_DETAIL_AREA = 0.012;
/** Texture weaker than this is at the mercy of the compression of the file. */
const TEXTURE_FLOOR = 0.006;
/**
 * Dark blocks stay out. Hair and dark clothes have edges all over, so the table gets few samples of those colors,
 * and its slope there is not sure enough to say how much detail should remain. Smoothing is on skin anyway.
 */
const TEXTURE_MIN_LIGHT = 0.2;
/** On a smaller photo the blocks are too few, and the compression too strong, to read texture. */
const DETAIL_MIN_SIDE = 480;

/**
 * Looks for a color change the table could not follow that sits in one place: a face lit on its own, say.
 * Each cell of a coarse grid averages the signed residual in Lab, so noise and edges cancel and only a shift
 * shared by a whole area stays.
 */
export function findLocalColor(samples, predicted) {
  const { input, output, gridW, gridH, index } = samples;
  const cellSide = Math.max(1, Math.round(Math.max(gridW, gridH) / 32));
  const w = Math.ceil(gridW / cellSide);
  const h = Math.ceil(gridH / cellSide);
  const sum = new Float32Array(w * h * 3);
  const count = new Float32Array(w * h);
  const n = input.length / 3;
  for (let i = 0; i < n; i++) {
    const g = index[i];
    const c = Math.floor(Math.floor(g / gridW) / cellSide) * w + Math.floor((g % gridW) / cellSide);
    const p = rgbToLab([predicted[i * 3], predicted[i * 3 + 1], predicted[i * 3 + 2]]);
    const q = rgbToLab([output[i * 3], output[i * 3 + 1], output[i * 3 + 2]]);
    sum[c * 3] += q[0] - p[0];
    sum[c * 3 + 1] += q[1] - p[1];
    sum[c * 3 + 2] += q[2] - p[2];
    count[c]++;
  }
  const size = new Float32Array(w * h);
  const shares = [];
  for (let c = 0; c < w * h; c++) {
    if (!count[c]) continue;
    size[c] = Math.hypot(sum[c * 3], sum[c * 3 + 1], sum[c * 3 + 2]) / count[c];
    shares.push(size[c]);
  }
  const typical = median(shares);
  const limit = Math.max(LOCAL_COLOR_MIN, typical * 3);
  const high = size.map((v) => (v > limit ? 1 : 0));
  const patch = largestPatch(high, w, h);
  const area = patch.size / (w * h);
  return { found: area >= LOCAL_COLOR_AREA, area, peak: percentile(shares, 0.995), box: patch.box };
}

/**
 * Looks for texture taken away or added in one place: skin smoothing, say. Each block compares the fine detail
 * of `after` with the one predicted, and that ratio is compared with the rest of the photo, so a photo that is
 * soft all over, from a resize, does not count.
 */
export function findLocalDetail(aligned, after, grainSigma, predictAt) {
  const { w, h } = after;
  if (Math.max(w, h) < DETAIL_MIN_SIDE) return { found: false, area: 0, box: null, tooSmall: true };
  const predicted = new Float32Array(w * h);
  const actual = new Float32Array(w * h);
  const out = [0, 0, 0];
  for (let i = 0; i < w * h; i++) {
    predictAt(i, out);
    predicted[i] = luma(out[0], out[1], out[2]);
    actual[i] = luma(after.rgb[i * 3], after.rgb[i * 3 + 1], after.rgb[i * 3 + 2]);
  }
  const lowP = boxBlur(predicted, w, h, 2);
  const lowA = boxBlur(actual, w, h, 2);
  const block = Math.max(8, Math.round(Math.max(w, h) / 48));
  const bw = Math.floor(w / block);
  const bh = Math.floor(h / block);
  const ratio = new Float32Array(bw * bh).fill(Number.NaN);
  const ratios = [];
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      let ep = 0;
      let ea = 0;
      let light = 0;
      let n = 0;
      for (let y = by * block; y < (by + 1) * block; y++) {
        for (let x = bx * block; x < (bx + 1) * block; x++) {
          const i = y * w + x;
          if (!aligned.valid[i]) continue;
          ep += (predicted[i] - lowP[i]) ** 2;
          ea += (actual[i] - lowA[i]) ** 2;
          light += predicted[i];
          n++;
        }
      }
      if (n < block * block * 0.9) continue;
      ep = Math.sqrt(ep / n);
      ea = Math.sqrt(Math.max(0, ea / n - grainSigma * grainSigma));
      if (ep < TEXTURE_FLOOR || light / n < TEXTURE_MIN_LIGHT) continue;
      ratio[by * bw + bx] = ea / ep;
      ratios.push(ea / ep);
    }
  }
  const typical = median(ratios);
  const low = ratio.map((r) => (r < typical * LOCAL_DETAIL_RATIO ? 1 : 0));
  const patch = largestPatch(low, bw, bh);
  const area = patch.size / (bw * bh);
  return { found: area >= LOCAL_DETAIL_AREA, area, typical, box: patch.box };
}

/** Everything a table and a vignette predict for one aligned photo, ready to be asked pixel by pixel. */
export function predictor(aligned, lut, vignette) {
  const { w, h } = aligned;
  return (i, out) => {
    const r = aligned.rgb[i * 3];
    const g = aligned.rgb[i * 3 + 1];
    const b = aligned.rgb[i * 3 + 2];
    lookup(lut, r, g, b, out);
    if (vignette) {
      const s = vignetteShape(((i % w) + 0.5) / w, (Math.floor(i / w) + 0.5) / h);
      out[0] = vignetteOn(out[0], vignette, s);
      out[1] = vignetteOn(out[1], vignette, s);
      out[2] = vignetteOn(out[2], vignette, s);
    }
    return out;
  };
}

