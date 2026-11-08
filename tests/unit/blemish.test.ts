import { describe, expect, it } from 'vitest';
import { findSkinSpots } from '../../src/core/face/blemish';

const W = 320;
const H = 320;
/** Size of the face on this grid. */
const FACE = 300;

/** Skin with a little grain, so the search has pores to ignore. */
function skin(): Float32Array[] {
  const r = new Float32Array(W * H);
  const g = new Float32Array(W * H);
  const b = new Float32Array(W * H);
  let seed = 7;
  const noise = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed / 2147483647 - 0.5) * 0.03;
  };
  for (let i = 0; i < W * H; i++) {
    const n = noise();
    r[i] = 0.86 + n;
    g[i] = 0.66 + n;
    b[i] = 0.54 + n;
  }
  return [r, g, b];
}

/** A soft red and dark spot, as the portrait fixture draws them. `amount` below 1 makes it fainter. */
function spot([r, g, b]: Float32Array[], cx: number, cy: number, radius: number, amount = 1): void {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * (radius / 1.6) ** 2));
      const i = y * W + x;
      r[i] *= 1 - 0.14 * k * amount;
      g[i] *= 1 - 0.38 * k * amount;
      b[i] *= 1 - 0.38 * k * amount;
    }
  }
}

function pack([r, g, b]: Float32Array[]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) out.set([r[i] * 255, g[i] * 255, b[i] * 255, 255], i * 4);
  return out;
}

const allSkin = () => new Float32Array(W * H).fill(1);

describe('spots on the skin', () => {
  it('finds each spot where it is, and only them', () => {
    const photo = skin();
    const places = [
      [60, 60, 4],
      [160, 80, 6],
      [250, 140, 3],
      [100, 220, 5],
      [230, 250, 7],
    ];
    for (const [x, y, r] of places) spot(photo, x, y, r);
    const found = findSkinSpots(pack(photo), allSkin(), W, H, FACE);
    expect(found.length).toBe(places.length);
    for (const [x, y] of places) expect(found.some((s) => Math.hypot(s.x - x, s.y - y) < 3)).toBe(true);
    // The radius covers the halo, so nothing is left as a ring.
    for (const s of found) expect(s.r).toBeGreaterThan(3);
  });

  it('finds nothing on even skin', () => {
    expect(findSkinSpots(pack(skin()), allSkin(), W, H, FACE)).toEqual([]);
  });

  it('leaves a line and a large shadow alone', () => {
    const photo = skin();
    for (let y = 40; y < 280; y++) {
      for (let x = 150; x < 154; x++) for (const c of photo) c[y * W + x] *= 0.6;
    }
    spot(photo, 80, 160, 40);
    expect(findSkinSpots(pack(photo), allSkin(), W, H, FACE)).toEqual([]);
  });

  it('leaves alone a dark hole, as a nostril, and what it is told to leave', () => {
    const photo = skin();
    // As dark as a nostril and not red: a hole, not a spot.
    const [r, g, b] = photo;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const k = Math.exp(-((x - 80) ** 2 + (y - 80) ** 2) / (2 * 3 ** 2));
        const i = y * W + x;
        r[i] *= 1 - 0.7 * k;
        g[i] *= 1 - 0.7 * k;
        b[i] *= 1 - 0.7 * k;
      }
    }
    spot(photo, 220, 220, 5);
    spot(photo, 240, 80, 5);
    const leave = new Float32Array(W * H);
    for (let y = 60; y < 100; y++) for (let x = 220; x < 260; x++) leave[y * W + x] = 1;
    const found = findSkinSpots(pack(photo), allSkin(), W, H, FACE, leave);
    expect(found.length).toBe(1);
    expect(Math.hypot(found[0].x - 220, found[0].y - 220)).toBeLessThan(3);
  });

  it('takes a large pimple when it stands out, and leaves as large a faint patch', () => {
    const strong = skin();
    spot(strong, 160, 160, 14);
    const found = findSkinSpots(pack(strong), allSkin(), W, H, FACE);
    expect(found.length).toBe(1);
    // The whole pimple, halo included.
    expect(found[0].r).toBeGreaterThan(14);
    const faint = skin();
    spot(faint, 160, 160, 14, 0.25);
    expect(findSkinSpots(pack(faint), allSkin(), W, H, FACE)).toEqual([]);
  });

  it('looks only where the pixels are surely skin', () => {
    const photo = skin();
    spot(photo, 60, 60, 5);
    spot(photo, 250, 250, 5);
    const where = allSkin();
    for (let y = 0; y < 120; y++) for (let x = 0; x < 120; x++) where[y * W + x] = 0;
    const found = findSkinSpots(pack(photo), where, W, H, FACE);
    expect(found.length).toBe(1);
    expect(Math.hypot(found[0].x - 250, found[0].y - 250)).toBeLessThan(3);
  });
});
