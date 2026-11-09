import { describe, expect, it } from 'vitest';
import { autoTone, type ToneFaces } from '../../src/core/tone';

const W = 120;
const H = 120;

type Rgb = readonly [number, number, number];

/** sRGB values for a linear light. */
const srgb = (linear: number) => Math.round(255 * (linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055));
const gray = (linear: number): Rgb => [srgb(linear), srgb(linear), srgb(linear)];
/** Skin of a given brightness: red over blue about 2.6, as under neutral light. */
const skin = (linear: number): Rgb => [srgb(linear * 1.6), srgb(linear * 0.95), srgb(linear * 0.62)];

function photo(paint: (x: number, y: number) => Rgb): Uint8ClampedArray {
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) out.set([...paint(x, y), 255], (y * W + x) * 4);
  }
  return out;
}

/** One face in the middle of the photo. */
const FACE: ToneFaces = { skin: [{ x: 60, y: 60, r: 14 }], heads: [{ x: 60, y: 60, r: 30 }] };
const onFace = (x: number, y: number) => (x - 60) ** 2 + (y - 60) ** 2 <= 30 * 30;

/** A portrait: a face with a wall behind it, and something bright and something dark. */
const portrait = (face: Rgb, wall: Rgb, bright = gray(0.85), dark = gray(0.012)) =>
  photo((x, y) => {
    if (onFace(x, y)) return face;
    if (y > 108) return bright;
    if (y < 12) return dark;
    return wall;
  });

describe('exposure', () => {
  it('leaves alone a face already in the band', () => {
    expect(autoTone(portrait(skin(0.3), gray(0.25)), W, H, FACE).exposure).toBe(0);
  });

  it('lifts a dark photo, up to where its highlights would clip', () => {
    const { exposure } = autoTone(portrait(skin(0.05), gray(0.04), gray(0.2)), W, H, FACE);
    expect(exposure).toBeGreaterThan(20);
    expect(exposure).toBeLessThanOrEqual(60);
  });

  it('does not treat dark skin on a well exposed photo as underexposed', () => {
    // The same dark skin as above, but with bright things around it, which say the light is good.
    const { exposure } = autoTone(portrait(skin(0.05), gray(0.25), gray(0.95)), W, H, FACE);
    expect(exposure).toBeLessThanOrEqual(10);
  });

  it('brings down a blown face', () => {
    expect(autoTone(portrait(skin(0.62), gray(0.3)), W, H, FACE).exposure).toBeLessThan(0);
  });

  it('meters the whole photo when it has no faces', () => {
    expect(autoTone(photo(() => gray(0.02)), W, H).exposure).toBeGreaterThan(20);
    expect(autoTone(photo(() => gray(0.18)), W, H).exposure).toBe(0);
  });
});

describe('contrast', () => {
  it('adds some to a flat photo', () => {
    const flat = photo((x) => gray(0.15 + (x / W) * 0.1));
    expect(autoTone(flat, W, H).contrast).toBeGreaterThan(10);
  });

  it('adds none when the photo goes from dark to bright', () => {
    const full = photo((x) => gray(0.003 + (x / W) ** 2 * 0.9));
    expect(autoTone(full, W, H).contrast).toBe(0);
  });

  it('stays small', () => {
    expect(autoTone(photo(() => gray(0.2)), W, H).contrast).toBeLessThanOrEqual(25);
  });
});

describe('white balance', () => {
  it('leaves a neutral photo alone', () => {
    const { temperature, tint } = autoTone(portrait(skin(0.3), gray(0.3)), W, H, FACE);
    expect(temperature).toBe(0);
    expect(tint).toBe(0);
  });

  it('cools a warm photo when its neutral surfaces and its skin both say so', () => {
    const warmWall: Rgb = [srgb(0.36), srgb(0.3), srgb(0.2)];
    const warmSkin: Rgb = [srgb(0.48), srgb(0.28), srgb(0.13)];
    const { temperature } = autoTone(portrait(warmSkin, warmWall), W, H, FACE);
    expect(temperature).toBeLessThan(-5);
    expect(temperature).toBeGreaterThanOrEqual(-14);
  });

  it('warms a cool photo', () => {
    const coolWall: Rgb = [srgb(0.22), srgb(0.28), srgb(0.36)];
    expect(autoTone(portrait(skin(0.3), coolWall), W, H, FACE).temperature).toBeGreaterThan(5);
  });

  it('does not cool skin that has no warmth to give, whatever the wall says', () => {
    // A beige wall reads as warm light, and this skin is not warm at all, so the wall is just beige.
    const beige: Rgb = [srgb(0.36), srgb(0.3), srgb(0.2)];
    const plain: Rgb = [srgb(0.45), srgb(0.285), srgb(0.195)];
    expect(autoTone(portrait(plain, beige), W, H, FACE).temperature).toBe(0);
  });

  it('takes no warmth off a portrait with no neutral surface in it', () => {
    const fill = photo((x, y) => (onFace(x, y) ? skin(0.3) : [srgb(0.05), srgb(0.3), srgb(0.05)]));
    expect(autoTone(fill, W, H, FACE).temperature).toBe(0);
  });

  it('does not mistake a neck or an arm for a warm wall', () => {
    const skinAll = photo(() => skin(0.3));
    const { temperature, tint } = autoTone(skinAll, W, H, FACE);
    expect(temperature).toBe(0);
    expect(tint).toBe(0);
  });

  it('keeps tint small, because magenta on skin reads as redness', () => {
    const green = photo(() => [srgb(0.2), srgb(0.32), srgb(0.2)]);
    expect(Math.abs(autoTone(green, W, H).tint)).toBeLessThanOrEqual(6);
  });
});

it('gives whole numbers, and zero when a change would not show', () => {
  const tone = autoTone(portrait(skin(0.3), gray(0.3)), W, H, FACE);
  for (const value of Object.values(tone)) expect(Number.isInteger(value)).toBe(true);
});
