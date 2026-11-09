/**
 * Auto-tone: reads a small copy of the photo and answers with values for the normal sliders. Plain math,
 * so it can be tested without a browser. The values follow `develop.frag`: 50 of exposure is one stop,
 * and temperature and tint are the gains on red, green and blue written there.
 *
 * Skin is what the person looks at, so faces set the exposure. A face is never pulled to one fixed
 * brightness: skin comes in every tone, and a dark one on a well exposed photo is not underexposed. So a
 * face inside a wide band stays, and a lift stops where the bright parts of the photo would clip.
 */

import type { Adjustments } from './doc';

/** A circle on the small copy of the photo, in its pixels. */
export interface ToneSpot {
  x: number;
  y: number;
  r: number;
}

/** What the detector says about the photo. Both lists are empty when it has no faces. */
export interface ToneFaces {
  /** Skin in the middle of each face, to meter. */
  skin: readonly ToneSpot[];
  /** All of each head, which says nothing about the color of the light. */
  heads: readonly ToneSpot[];
}

export type AutoTone = Pick<Adjustments, 'exposure' | 'contrast' | 'temperature' | 'tint'>;

/** A face this bright in linear light needs no change. */
const FACE_BAND = [0.17, 0.42] as const;
/** The same for a photo without faces, on the mean of its logarithm. */
const SCENE_BAND = [0.09, 0.3] as const;
/** How far toward the band a photo goes: a correction that goes all the way looks like a filter. */
const EXPOSURE_PULL = 0.7;
const MAX_LIFT_STOPS = 1.2;
const MAX_DROP_STOPS = 0.5;
/** Even with something bright in the photo a dark face gets this much, for a backlit portrait. */
const LIFT_PAST_HIGHLIGHTS = 0.2;
const SLIDER_PER_STOP = 50;

/** Between the darkest and brightest parts of a photo with enough contrast, in sRGB. */
const CONTRAST_SPAN = 0.72;
const CONTRAST_GAIN = 90;
const MAX_CONTRAST = 25;

/** Pixels this close to gray, as a logarithm of the channel ratios, may be a neutral thing under a colored light. */
const NEUTRAL_WIDE = 0.34;
const NEUTRAL_NARROW = 0.14;
/** Under this share of the photo, no surface says what the light is. */
const MIN_NEUTRAL_SHARE = 0.015;
/** A correction goes only part of the way. Warm or cool light is often the point of a photo. */
const BALANCE_PULL = 0.5;
const MAX_TEMPERATURE = 14;
/** Small, because on skin the magenta side of tint reads as redness and brings out every blemish. */
const MAX_TINT = 6;
/** A pixel this close to the color of the skin found, in the terms of the neutral search, is more skin: a neck, an arm. */
const SKIN_NEAR_RB = 0.4;
const SKIN_NEAR_GREEN = 0.14;
/** The gains of `develop.frag` per unit of the slider: on the red and blue ratio, and on green. */
const TEMP_GAIN = 0.44;
const TINT_GAIN = 0.18;
/**
 * Red over blue in linear light. Skin under neutral light sits around here, whatever its tone, so skin at
 * this ratio or below has no warmth to give, even when a beige wall says the light is warm. Measured on real
 * photos: 2.6 under a white wall, 2.3 in a car with a beige ceiling, and 3.8 under a warm lamp or at sunset.
 */
const COLDEST_SKIN = 2.35;
/** Above this, skin already looks warm, and the photo gets no warmer whatever a cool wall says. */
const WARMEST_SKIN = 3.6;

/** Below this a slider stays at zero: nobody sees it, and a clean zero says the photo was fine. */
const NOT_WORTH = 2;

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

/** One table instead of a power per channel per pixel. */
const LINEAR = Float32Array.from({ length: 256 }, (_, i) => toLinear(i / 255));

const clamp = (v: number, low: number, high: number) => Math.min(high, Math.max(low, v));

function quantile(sorted: Float32Array, q: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

const tidy = (v: number) => (Math.abs(v) < NOT_WORTH ? 0 : Math.round(v));

/** Stops toward the band, zero inside it. */
function stopsToBand(level: number, [low, high]: readonly [number, number]): number {
  if (level <= 0) return 0;
  if (level < low) return Math.log2(low / level) * EXPOSURE_PULL;
  if (level > high) return Math.log2(high / level) * EXPOSURE_PULL;
  return 0;
}

interface Pixels {
  /** Linear light of each pixel, in reading order. */
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
  y: Float32Array;
  /** The pixel is on the skin metered. */
  skin: Uint8Array;
  /** The pixel is on a head. */
  head: Uint8Array;
}

function stamp(into: Uint8Array, w: number, h: number, spots: readonly ToneSpot[]): void {
  for (const { x, y, r } of spots) {
    for (let py = Math.max(0, Math.floor(y - r)); py < Math.min(h, Math.ceil(y + r)); py++) {
      for (let px = Math.max(0, Math.floor(x - r)); px < Math.min(w, Math.ceil(x + r)); px++) {
        if ((px + 0.5 - x) ** 2 + (py + 0.5 - y) ** 2 <= r * r) into[py * w + px] = 1;
      }
    }
  }
}

function readPixels(rgba: ArrayLike<number>, w: number, h: number, faces: ToneFaces): Pixels {
  const n = w * h;
  const out: Pixels = {
    r: new Float32Array(n),
    g: new Float32Array(n),
    b: new Float32Array(n),
    y: new Float32Array(n),
    skin: new Uint8Array(n),
    head: new Uint8Array(n),
  };
  for (let i = 0; i < n; i++) {
    const r = LINEAR[rgba[i * 4]];
    const g = LINEAR[rgba[i * 4 + 1]];
    const b = LINEAR[rgba[i * 4 + 2]];
    out.r[i] = r;
    out.g[i] = g;
    out.b[i] = b;
    out.y[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  stamp(out.skin, w, h, faces.skin);
  stamp(out.head, w, h, faces.heads);
  return out;
}

/** The exposure, in stops. */
function findExposure(p: Pixels): number {
  const faceLight: number[] = [];
  let logSum = 0;
  for (let i = 0; i < p.y.length; i++) {
    if (p.skin[i]) faceLight.push(p.y[i]);
    logSum += Math.log(Math.max(p.y[i], 1e-3));
  }
  const level = faceLight.length ? median(faceLight) : Math.exp(logSum / p.y.length);
  const stops = stopsToBand(level, faceLight.length ? FACE_BAND : SCENE_BAND);
  if (stops <= 0) return Math.max(stops, -MAX_DROP_STOPS);
  const sorted = p.y.slice().sort();
  const room = Math.log2(0.98 / Math.max(quantile(sorted, 0.99), 1e-3));
  return Math.min(stops, MAX_LIFT_STOPS, Math.max(room, LIFT_PAST_HIGHLIGHTS));
}

/** The contrast slider, once the exposure is on the photo. */
function findContrast(p: Pixels, stops: number): number {
  const gain = 2 ** stops;
  const srgb = Float32Array.from(p.y, (y) => toSrgb(Math.min(1, y * gain))).sort();
  const span = quantile(srgb, 0.97) - quantile(srgb, 0.03);
  return clamp((CONTRAST_SPAN - span) * CONTRAST_GAIN, 0, MAX_CONTRAST);
}

const redOverBlue = (p: Pixels, i: number) => Math.log(p.r[i] / Math.max(p.b[i], 1e-3));
const magentaOverGreen = (p: Pixels, i: number) => Math.log(Math.sqrt(p.r[i] * p.b[i]) / Math.max(p.g[i], 1e-3));

function median(list: number[]): number {
  list.sort((a, b) => a - b);
  return list[list.length >> 1];
}

/** The color of the skin metered, in the terms of the neutral search. Null without faces. */
function skinColor(p: Pixels): { rb: number; green: number } | null {
  const rb: number[] = [];
  const green: number[] = [];
  for (let i = 0; i < p.y.length; i++) {
    if (!p.skin[i] || p.y[i] < 0.01) continue;
    rb.push(redOverBlue(p, i));
    green.push(magentaOverGreen(p, i));
  }
  return rb.length ? { rb: median(rb), green: median(green) } : null;
}

/** Off the heads. Too dark says little and carries noise, and a clipped channel lies about the color. */
const saysTheLight = (p: Pixels, i: number) => !p.head[i] && p.y[i] >= 0.03 && Math.max(p.r[i], p.g[i], p.b[i]) <= 0.94;

/**
 * Gray pixels away from the skin say what color the light is. Skin cannot: it is never neutral, and gray
 * world would take the warmth off every portrait. Starting wide and closing in on the color found
 * follows a strong cast, where nothing is close to gray any more.
 */
function findCast(p: Pixels, skin: { rb: number; green: number } | null): { rb: number; green: number } | null {
  let centerRb = 0;
  let centerGreen = 0;
  let width = NEUTRAL_WIDE;
  let share = 0;
  const n = p.y.length;
  for (let round = 0; round < 3; round++) {
    let sumRb = 0;
    let sumGreen = 0;
    let count = 0;
    for (let i = 0; i < n; i++) {
      if (!saysTheLight(p, i)) continue;
      const rb = redOverBlue(p, i);
      const green = magentaOverGreen(p, i);
      if (Math.abs(rb - centerRb) > width * 2 || Math.abs(green - centerGreen) > width) continue;
      if (skin && Math.abs(rb - skin.rb) < SKIN_NEAR_RB && Math.abs(green - skin.green) < SKIN_NEAR_GREEN) continue;
      sumRb += rb;
      sumGreen += green;
      count++;
    }
    if (!count) return null;
    centerRb = sumRb / count;
    centerGreen = sumGreen / count;
    share = count / n;
    width = NEUTRAL_NARROW + (width - NEUTRAL_NARROW) * 0.5;
  }
  return share < MIN_NEUTRAL_SHARE ? null : { rb: centerRb, green: centerGreen };
}

/** Temperature and tint, in slider units. Skin keeps some warmth whatever the rest of the photo says. */
function findBalance(p: Pixels): Pick<AutoTone, 'temperature' | 'tint'> {
  const skin = skinColor(p);
  const cast = findCast(p, skin);
  if (!cast) return { temperature: 0, tint: 0 };
  let temperature = clamp((-cast.rb / TEMP_GAIN) * BALANCE_PULL * 100, -MAX_TEMPERATURE, MAX_TEMPERATURE);
  const tint = clamp((-cast.green / TINT_GAIN) * BALANCE_PULL * 100, -MAX_TINT, MAX_TINT);
  if (skin && temperature < 0) {
    const free = Math.max(0, skin.rb - Math.log(COLDEST_SKIN));
    temperature = Math.max(temperature, -(free / TEMP_GAIN) * 100);
  } else if (skin && temperature > 0) {
    const free = Math.max(0, Math.log(WARMEST_SKIN) - skin.rb);
    temperature = Math.min(temperature, (free / TEMP_GAIN) * 100);
  }
  return { temperature, tint };
}

const NO_FACES: ToneFaces = { skin: [], heads: [] };

/** What the sliders should say for this photo. `rgba` is a small copy of it. */
export function autoTone(rgba: ArrayLike<number>, w: number, h: number, faces: ToneFaces = NO_FACES): AutoTone {
  const p = readPixels(rgba, w, h, faces);
  const stops = findExposure(p);
  const { temperature, tint } = findBalance(p);
  return {
    exposure: tidy(stops * SLIDER_PER_STOP),
    contrast: tidy(findContrast(p, stops)),
    temperature: tidy(temperature),
    tint: tidy(tint),
  };
}
