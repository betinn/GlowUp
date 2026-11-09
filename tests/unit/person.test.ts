import { describe, expect, it } from 'vitest';
import { makeFace } from '../../src/core/face/scan';
import { fillInnerHoles, finishMatte, followColors, headCrop, keepWhatTouchesFaces, personConfidence, type PersonSeen } from '../../src/core/face/person';
import { buildPlate, nearestCells } from '../../src/core/face/plate';
import { oval } from './face-fixtures';

const SIZE = 200;
const FACE = makeFace(oval(0.5, 0.45, 0.16, 0.2));

/** A photo with a bright background and a darker person, as RGBA. */
function photo(inside: (x: number, y: number) => boolean, back = 230, front = 90): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const v = inside(x, y) ? front : back;
      const o = (y * SIZE + x) * 4;
      rgba[o] = v;
      rgba[o + 1] = v;
      rgba[o + 2] = v;
      rgba[o + 3] = 255;
    }
  }
  return rgba;
}

const target = (rgba: Uint8ClampedArray) => ({
  w: SIZE,
  h: SIZE,
  color: () => rgba,
  luma: () => {
    const out = new Float32Array(SIZE * SIZE);
    for (let i = 0; i < out.length; i++) out[i] = rgba[i * 4] / 255;
    return out;
  },
});

const insideFace = (x: number, y: number) => ((x - 100) / 32) ** 2 + ((y - 90) / 40) ** 2 < 1;

describe('the square around a head', () => {
  it('takes in the hair and the neck, and stays inside the photo', () => {
    const crop = headCrop({ x: 0.4, y: 0.3, w: 0.2, h: 0.2 }, 1000, 1000);
    expect(crop.w).toBe(680);
    expect(crop.y + crop.h / 2).toBeGreaterThan(400);
    const corner = headCrop({ x: 0, y: 0, w: 0.3, h: 0.3 }, 1000, 1000);
    expect(corner.x).toBe(0);
    expect(corner.y).toBe(0);
    const whole = headCrop({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 }, 500, 800);
    expect(whole.w).toBeLessThanOrEqual(500);
    expect(whole.h).toBeLessThanOrEqual(800);
  });
});

describe('what the models say', () => {
  const area = (data: (fx: number, fy: number) => number) => {
    const w = 64;
    const cut = new Float32Array(w * w);
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) cut[y * w + x] = data((x + 0.5) / w, (y + 0.5) / w);
    return { data: cut, w, h: w };
  };
  const nothing = () => area(() => 0);

  it('reads the whole photo, then each head, and stops when asked', async () => {
    const asked: number[] = [];
    const seen = await personConfidence(
      { w: 3000, h: 3000 },
      { w: 50, h: 50 },
      [makeFace(oval(0.5, 0.45, 0.08, 0.1))],
      {
        person: (a) => {
          asked.push(a.w);
          return a.w === 3000 ? nothing() : area(() => 1);
        },
        hair: nothing,
      },
      async () => undefined,
      () => undefined,
      () => false,
    );
    expect(asked[0]).toBe(3000);
    expect(asked).toHaveLength(2);
    // On the head the crop says so, and the far corner keeps what the whole photo said.
    expect(seen!.person[22 * 50 + 25]).toBeGreaterThan(0.9);
    expect(seen!.person[0]).toBe(0);
    const stopped = await personConfidence({ w: 100, h: 100 }, { w: 10, h: 10 }, [FACE], { person: nothing, hair: nothing }, async () => undefined, () => undefined, () => true);
    expect(stopped).toBeNull();
  });
});

describe('the matte', () => {
  const seenFrom = (person: (x: number, y: number) => number, hair: (x: number, y: number) => number = () => 0): PersonSeen => {
    const p = new Float32Array(SIZE * SIZE);
    const h = new Float32Array(SIZE * SIZE);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        p[y * SIZE + x] = person(x, y);
        h[y * SIZE + x] = hair(x, y);
      }
    }
    return { person: p, hair: h };
  };

  it('holds the face whole and leaves the background at exactly zero', () => {
    const rgba = photo(insideFace);
    const matte = finishMatte(seenFrom(() => 0), [FACE], target(rgba))!;
    expect(matte[90 * SIZE + 100]).toBe(255);
    expect(matte[5 * SIZE + 5]).toBe(0);
    expect(matte[190 * SIZE + 190]).toBe(0);
  });

  it('takes out a pillow the model likes, above the chin, away from the head', () => {
    const rgba = photo(insideFace);
    // The model is unsure of a band at the height of the eyes, reaching the side of the photo.
    const seen = seenFrom((x, y) => (y > 70 && y < 110 && x > 60 ? 0.95 : 0));
    const matte = finishMatte(seen, [FACE], target(rgba))!;
    expect(matte[90 * SIZE + 190]).toBe(0);
    expect(matte[90 * SIZE + 100]).toBe(255);
  });

  it('keeps a body below the chin, joined to the face', () => {
    const inside = (x: number, y: number) => insideFace(x, y) || (y > 125 && x > 50 && x < 150);
    const rgba = photo(inside);
    const matte = finishMatte(seenFrom((x, y) => (inside(x, y) ? 1 : 0)), [FACE], target(rgba))!;
    expect(matte[170 * SIZE + 100]).toBe(255);
    expect(matte[170 * SIZE + 180]).toBe(0);
  });

  it('says there is nobody when there is nobody', () => {
    const rgba = photo(() => false);
    expect(finishMatte(seenFrom(() => 0), [], target(rgba))).toBeNull();
  });

  it('takes out what does not touch a face', () => {
    const matte = new Uint8Array(SIZE * SIZE);
    for (let y = 60; y < 120; y++) for (let x = 70; x < 130; x++) matte[y * SIZE + x] = 255;
    for (let y = 10; y < 30; y++) for (let x = 170; x < 195; x++) matte[y * SIZE + x] = 255;
    keepWhatTouchesFaces(matte, [FACE], SIZE, SIZE);
    expect(matte[90 * SIZE + 100]).toBe(255);
    expect(matte[20 * SIZE + 180]).toBe(0);
  });

  it('fills a small hole in the middle of a person and no gap that reaches the side', () => {
    const matte = new Uint8Array(SIZE * SIZE).fill(255);
    matte[100 * SIZE + 100] = 0;
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) matte[y * SIZE + x] = 0;
    fillInnerHoles(matte, SIZE, SIZE);
    expect(matte[100 * SIZE + 100]).toBe(255);
    expect(matte[10 * SIZE + 10]).toBe(0);
  });

  it('moves the edge to where the colors change', () => {
    const rgba = photo((x) => x < 100);
    // The edge the model gives is ten cells off, inside the band.
    const shape = new Float32Array(SIZE * SIZE);
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < 110; x++) shape[y * SIZE + x] = 1;
    const out = followColors(shape, rgba, SIZE, SIZE, 14);
    expect(out[100 * SIZE + 105]).toBeLessThan(0.05);
    expect(out[100 * SIZE + 95]).toBeGreaterThan(0.95);
  });

  it('leaves the edge alone where both sides have the same color', () => {
    const rgba = photo(() => false);
    const shape = new Float32Array(SIZE * SIZE);
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < 110; x++) shape[y * SIZE + x] = 1;
    expect(followColors(shape, rgba, SIZE, SIZE, 14)).toEqual(shape);
  });
});

describe('the background behind the person', () => {
  const matteOf = (inside: (x: number, y: number) => boolean) => {
    const matte = new Uint8Array(SIZE * SIZE);
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) matte[y * SIZE + x] = inside(x, y) ? 255 : 0;
    return matte;
  };

  it('finds the nearest cell of a mark', () => {
    const seed = new Uint8Array(100);
    seed[0] = 1;
    seed[99] = 1;
    const near = nearestCells(seed, 10, 10);
    expect(near[11]).toBe(0);
    expect(near[88]).toBe(99);
  });

  it('has no alpha away from a person, and there it is the photo', () => {
    const rgba = photo(insideFace);
    const plate = buildPlate(rgba, matteOf(insideFace), SIZE, SIZE);
    const at = (x: number, y: number) => (y * SIZE + x) * 4;
    expect(plate[at(5, 5) + 3]).toBe(0);
    expect(plate[at(5, 5)]).toBe(230);
    // Right on the person it counts in full, a few cells around too.
    expect(plate[at(100, 90) + 3]).toBe(255);
    expect(plate[at(100 + 34, 90) + 3]).toBe(255);
  });

  it('brings the color of the background in, not of the person', () => {
    const rgba = photo(insideFace);
    const plate = buildPlate(rgba, matteOf(insideFace), SIZE, SIZE);
    expect(plate[(90 * SIZE + 100) * 4]).toBeGreaterThan(220);
  });

  it('follows the colors on each side of the hole', () => {
    // Dark on the left of the photo, light on the right, with the person on the seam.
    const rgba = new Uint8ClampedArray(SIZE * SIZE * 4);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const v = x < 100 ? 40 : 220;
        const o = (y * SIZE + x) * 4;
        rgba.set([v, v, v, 255], o);
      }
    }
    const plate = buildPlate(rgba, matteOf(insideFace), SIZE, SIZE);
    const v = (x: number) => plate[(90 * SIZE + x) * 4];
    expect(v(75)).toBeLessThan(90);
    expect(v(125)).toBeGreaterThan(170);
  });

  it('mirrors fine texture into the hole, and no strong edge', () => {
    const noise = new Uint8ClampedArray(SIZE * SIZE * 4);
    for (let i = 0; i < SIZE * SIZE; i++) {
      const v = 120 + (((i * 7919) % 13) - 6);
      noise.set([v, v, v, 255], i * 4);
    }
    const plate = buildPlate(noise, matteOf(insideFace), SIZE, SIZE);
    const seen = new Set<number>();
    for (let x = 80; x < 120; x++) seen.add(plate[(90 * SIZE + x) * 4]);
    expect(seen.size).toBeGreaterThan(3);
  });

  it('keeps the plate off when there is no background at all', () => {
    const rgba = photo(() => true);
    const plate = buildPlate(rgba, new Uint8Array(SIZE * SIZE).fill(255), SIZE, SIZE);
    expect(plate[(90 * SIZE + 100) * 4 + 3]).toBe(0);
  });
});
