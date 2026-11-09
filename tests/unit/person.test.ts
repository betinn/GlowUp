import { describe, expect, it } from 'vitest';
import { makeFace } from '../../src/core/face/scan';
import { castShadow, faceCrop, fillInnerHoles, finishMattes, hairHalo, headCrop, keepWhatTouchesFaces, personConfidence, TRACE, type PartsCut, type PersonSeen } from '../../src/core/face/person';
import { buildPlate, extendMouth, nearestCells, spreadKnown } from '../../src/core/face/plate';
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
/** A neck and shoulders under the face. */
const insideBody = (x: number, y: number) => y > 122 && x > 60 && x < 140;

describe('the squares around a head', () => {
  it('take in the hair and the neck, stay inside the photo, and the close one is smaller', () => {
    const crop = headCrop({ x: 0.4, y: 0.3, w: 0.2, h: 0.2 }, 1000, 1000);
    expect(crop.w).toBe(680);
    expect(crop.y + crop.h / 2).toBeGreaterThan(400);
    const corner = headCrop({ x: 0, y: 0, w: 0.3, h: 0.3 }, 1000, 1000);
    expect(corner.x).toBe(0);
    expect(corner.y).toBe(0);
    const whole = headCrop({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 }, 500, 800);
    expect(whole.w).toBeLessThanOrEqual(500);
    expect(whole.h).toBeLessThanOrEqual(800);
    expect(faceCrop({ x: 0.4, y: 0.3, w: 0.2, h: 0.2 }, 1000, 1000).w).toBeLessThan(crop.w);
  });
});

/** What the person segmenter would say about a crop, from what each point of it is. */
function parts(what: (fx: number, fy: number) => 'back' | 'hair' | 'body' | 'face' | 'clothes' | 'other'): PartsCut {
  const w = 64;
  const cut = (): Float32Array => new Float32Array(w * w);
  const out: PartsCut = { w, h: w, back: cut(), hair: cut(), body: cut(), face: cut(), clothes: cut(), other: cut() };
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) out[what((x + 0.5) / w, (y + 0.5) / w)][y * w + x] = 1;
  return out;
}

describe('what the models say', () => {
  const noHair = () => ({ data: new Float32Array(64 * 64), w: 64, h: 64 });
  const run = (models: Parameters<typeof personConfidence>[3], faces = [makeFace(oval(0.5, 0.45, 0.08, 0.1))], stopped = false) =>
    personConfidence({ w: 3000, h: 3000 }, { w: 60, h: 60 }, faces, models, async () => undefined, () => undefined, () => stopped);

  it('reads the whole photo, then each head from far and from close, and stops when asked', async () => {
    const asked: number[] = [];
    const seen = await run({
      parts: (a) => {
        asked.push(a.w);
        return parts(() => (a.w === 3000 ? 'back' : 'face'));
      },
      hair: noHair,
    });
    expect(asked[0]).toBe(3000);
    expect(asked).toHaveLength(3);
    expect(asked[2]).toBeLessThan(asked[1]);
    // On the head the crops say so, and the far corner keeps what the whole photo said.
    expect(seen!.person[27 * 60 + 30]).toBeGreaterThan(0.9);
    expect(seen!.head[27 * 60 + 30]).toBeGreaterThan(0.9);
    expect(seen!.person[0]).toBe(0);
    expect(await run({ parts: () => parts(() => 'back'), hair: noHair }, undefined, true)).toBeNull();
  });

  it('a head is hair and the skin of the face: a neck and a shirt are a person, and no head', async () => {
    const seen = await run({ parts: () => parts((_fx, fy) => (fy < 0.3 ? 'hair' : fy < 0.5 ? 'face' : fy < 0.7 ? 'body' : 'clothes')), hair: noHair });
    const at = (v: number) => Math.floor(v * 60) * 60 + 30;
    // The crops are around the face, so their heights fall around the middle of the photo.
    const face = at(0.45);
    expect(seen!.head[face]).toBeGreaterThan(0.9);
    expect(seen!.skin[face]).toBeGreaterThan(0.9);
    const shirt = at(0.72);
    expect(seen!.person[shirt]).toBeGreaterThan(0.9);
    expect(seen!.head[shirt]).toBeLessThan(0.1);
  });

  it('glasses on a face belong to the head, and a necklace below the chin does not', async () => {
    // What is worn is everywhere: only where it is decides whose it is.
    const seen = await run({ parts: () => parts(() => 'other'), hair: noHair });
    const at = (u: number, v: number) => Math.floor(v * 60) * 60 + Math.floor(u * 60);
    expect(seen!.head[at(0.5, 0.42)]).toBeGreaterThan(0.9);
    // Past the side of the face, where the arm of a pair of glasses sticks out.
    expect(seen!.head[at(0.62, 0.42)]).toBeGreaterThan(0.9);
    expect(seen!.head[at(0.5, 0.64)]).toBeLessThan(0.1);
    expect(seen!.person[at(0.5, 0.64)]).toBeGreaterThan(0.9);
  });
});

describe('the mattes', () => {
  const seenFrom = (person: (x: number, y: number) => number, head: (x: number, y: number) => number, hair: (x: number, y: number) => number = () => 0): PersonSeen => {
    const out = { person: new Float32Array(SIZE * SIZE), head: new Float32Array(SIZE * SIZE), skin: new Float32Array(SIZE * SIZE), hair: new Float32Array(SIZE * SIZE) };
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const at = y * SIZE + x;
        out.person[at] = person(x, y);
        out.head[at] = head(x, y);
        out.skin[at] = person(x, y);
        out.hair[at] = hair(x, y);
      }
    }
    return out;
  };
  const one = (inside: boolean) => (inside ? 1 : 0);

  it('hold the face whole and leave the background at exactly zero', () => {
    const rgba = photo(insideFace);
    const mattes = finishMattes(seenFrom((x, y) => one(insideFace(x, y)), (x, y) => one(insideFace(x, y))), [FACE], target(rgba))!;
    expect(mattes.head[90 * SIZE + 100]).toBe(255);
    expect(mattes.person[90 * SIZE + 100]).toBe(255);
    for (const at of [5 * SIZE + 5, 190 * SIZE + 190, 90 * SIZE + 150]) {
      expect(mattes.head[at]).toBe(0);
      expect(mattes.person[at]).toBe(0);
    }
  });

  it('a pale thing beside the jaw that no model calls a person stays out of both', () => {
    // The pillow of the photo that failed: as bright as the skin next to it, right against the jaw.
    const pillow = (x: number, y: number) => x > 132 && y > 80 && y < 150;
    const rgba = photo((x, y) => insideFace(x, y) || insideBody(x, y) || pillow(x, y), 230, 200);
    const person = (x: number, y: number) => one(insideFace(x, y) || insideBody(x, y));
    const mattes = finishMattes(seenFrom(person, (x, y) => one(insideFace(x, y))), [FACE], target(rgba))!;
    for (const [x, y] of [[150, 100], [145, 125], [160, 140]]) {
      expect(mattes.person[y * SIZE + x]).toBe(0);
      expect(mattes.head[y * SIZE + x]).toBe(0);
    }
  });

  it('the head stops at the jaw: the neck is a person with almost no head on it', () => {
    const rgba = photo((x, y) => insideFace(x, y) || insideBody(x, y));
    const mattes = finishMattes(seenFrom((x, y) => one(insideFace(x, y) || insideBody(x, y)), (x, y) => one(insideFace(x, y))), [FACE], target(rgba))!;
    // Well below the chin, past the shadow of the head.
    expect(mattes.person[165 * SIZE + 100]).toBe(255);
    expect(mattes.head[165 * SIZE + 100]).toBe(0);
    // Every head is inside the person.
    for (let i = 0; i < mattes.head.length; i++) expect(mattes.head[i]).toBeLessThanOrEqual(mattes.person[i]);
  });

  it('say there is nobody when there is nobody', () => {
    const rgba = photo(() => false);
    expect(finishMattes(seenFrom(() => 0, () => 0), [], target(rgba))).toBeNull();
  });

  it('no stray low value is left in a matte, where it would read as a trace', () => {
    const rgba = photo(insideFace);
    // A soft model: confidence falls slowly away from the face.
    const soft = (x: number, y: number) => Math.max(0, 1 - Math.hypot((x - 100) / 60, (y - 90) / 70));
    const mattes = finishMattes(seenFrom(soft, soft), [FACE], target(rgba))!;
    for (let i = 0; i < mattes.head.length; i++) expect(mattes.head[i] === 0 || mattes.head[i] > TRACE).toBe(true);
  });

  it('takes out what does not touch a face', () => {
    const matte = new Uint8Array(SIZE * SIZE);
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (insideFace(x, y) || (x > 170 && y < 20)) matte[y * SIZE + x] = 255;
    keepWhatTouchesFaces(matte, [FACE], SIZE, SIZE);
    expect(matte[90 * SIZE + 100]).toBe(255);
    expect(matte[10 * SIZE + 180]).toBe(0);
  });

  it('fills a small hole in the middle of a person and no gap that reaches the side', () => {
    const matte = new Uint8Array(SIZE * SIZE).fill(255);
    for (let y = 95; y < 100; y++) for (let x = 95; x < 100; x++) matte[y * SIZE + x] = 0;
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) matte[y * SIZE + x] = 0;
    fillInnerHoles(matte, SIZE, SIZE);
    expect(matte[97 * SIZE + 97]).toBe(255);
    expect(matte[10 * SIZE + 10]).toBe(0);
  });
});

describe('the shadow of a head and the halo of its hair', () => {
  const blank = () => new Uint8Array(SIZE * SIZE);

  it('the matte of the head fades out over the skin under it, and stops dead over the background', () => {
    const head = blank();
    const person = blank();
    const skin = new Float32Array(SIZE * SIZE);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const at = y * SIZE + x;
        if (y < 100) head[at] = 255;
        // Skin under the left half of the head, background under the right half.
        if (y < 100 || x < 100) person[at] = 255;
        if (x < 100) skin[at] = 1;
      }
    }
    castShadow(head, person, skin, SIZE, SIZE, 20);
    const under = (x: number, down: number) => head[(100 + down) * SIZE + x];
    expect(under(40, 2)).toBeGreaterThan(150);
    expect(under(40, 10)).toBeGreaterThan(TRACE);
    expect(under(40, 10)).toBeLessThan(under(40, 2));
    expect(under(40, 25)).toBe(0);
    expect(under(160, 2)).toBe(0);
  });

  it('a shirt under the head gets no shadow: its edges are its own', () => {
    const head = blank();
    const person = blank().fill(255);
    for (let i = 0; i < 100 * SIZE; i++) head[i] = 255;
    castShadow(head, person, new Float32Array(SIZE * SIZE), SIZE, SIZE, 20);
    expect(head[104 * SIZE + 50]).toBe(0);
  });

  it('around hair the matte goes further, and past that the background is marked as ground to clear', () => {
    const head = blank();
    const person = blank();
    const hair = new Float32Array(SIZE * SIZE);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < 100; x++) {
        head[y * SIZE + x] = 255;
        person[y * SIZE + x] = 255;
        // Hair on the upper half, skin on the lower.
        if (y < 100) hair[y * SIZE + x] = 1;
      }
    }
    hairHalo(head, hair, SIZE, SIZE, 8, 24, person);
    const beside = (y: number, out: number) => head[y * SIZE + 99 + out];
    // Next to hair: still head for a few cells, then a trace, then nothing.
    expect(beside(40, 3)).toBe(255);
    expect(beside(40, 14)).toBeGreaterThan(0);
    expect(beside(40, 14)).toBeLessThanOrEqual(TRACE);
    expect(beside(40, 30)).toBe(0);
    // Next to skin, far from any hair: nothing at all.
    expect(beside(170, 3)).toBe(0);
  });
});

describe('the plates behind the layers', () => {
  const body = (x: number, y: number) => ((x - 100) / 40) ** 2 + ((y - 100) / 60) ** 2 < 1;
  const matteOf = (inside: (x: number, y: number) => boolean) => {
    const matte = new Uint8Array(SIZE * SIZE);
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (inside(x, y)) matte[y * SIZE + x] = 255;
    return matte;
  };

  it('finds the nearest cell of a mark', () => {
    const seed = new Uint8Array(100);
    seed[3 * 10 + 4] = 1;
    const near = nearestCells(seed, 10, 10);
    expect(near[0]).toBe(34);
    expect(near[99]).toBe(34);
    expect(nearestCells(new Uint8Array(100), 10, 10)[50]).toBe(-1);
  });

  it('has no alpha away from the layer, and there it is the photo', () => {
    const rgba = photo(body);
    const plate = buildPlate(rgba, matteOf(body), SIZE, SIZE);
    const far = (10 * SIZE + 10) * 4;
    expect(plate[far + 3]).toBe(0);
    expect(plate[far]).toBe(rgba[far]);
    expect(plate[(100 * SIZE + 100) * 4 + 3]).toBe(255);
  });

  it('covers only a few cells of background around the layer', () => {
    const plate = buildPlate(photo(body), matteOf(body), SIZE, SIZE);
    // The layer ends at x = 140 on this line.
    expect(plate[(100 * SIZE + 142) * 4 + 3]).toBeGreaterThan(0);
    expect(plate[(100 * SIZE + 147) * 4 + 3]).toBe(0);
  });

  it('brings the color of the background in, not of the layer', () => {
    const plate = buildPlate(photo(body), matteOf(body), SIZE, SIZE);
    expect(plate[(100 * SIZE + 100) * 4]).toBeGreaterThan(200);
  });

  it('where the matte fades slowly, the plate counts as much as the matte does', () => {
    const matte = matteOf(body);
    // A soft skirt well past the solid part.
    for (let x = 60; x < 140; x++) matte[175 * SIZE + x] = 60;
    const plate = buildPlate(photo(body), matte, SIZE, SIZE);
    const alpha = plate[(175 * SIZE + 100) * 4 + 3];
    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThan(255);
  });

  it('a trace in the matte is ground the plate takes over in full', () => {
    const matte = matteOf(body);
    for (let x = 160; x < 180; x++) matte[30 * SIZE + x] = 4;
    const plate = buildPlate(photo(body), matte, SIZE, SIZE);
    expect(plate[(30 * SIZE + 170) * 4 + 3]).toBe(255);
  });

  it('keeps the plate off when there is no background at all', () => {
    const plate = buildPlate(photo(() => true), new Uint8Array(SIZE * SIZE).fill(255), SIZE, SIZE);
    expect(plate[(100 * SIZE + 100) * 4 + 3]).toBe(0);
  });

  it('carries the inside of a mouth on under the lips, and leaves the rest of the plate', () => {
    const mouth = new Uint8Array(SIZE * SIZE);
    const rgba = photo(() => true, 0, 150);
    // Dark at the left end of the opening and white teeth in the rest of it.
    for (let y = 98; y < 103; y++) {
      for (let x = 80; x < 120; x++) {
        mouth[y * SIZE + x] = 255;
        const v = x < 88 ? 20 : 240;
        rgba.set([v, v, v], (y * SIZE + x) * 4);
      }
    }
    const plate = new Uint8Array(rgba);
    extendMouth(plate, rgba, mouth, SIZE, SIZE, 10);
    // Past the dark end it is dark, and above the teeth it is light: each carries on what is next to it.
    expect(plate[(100 * SIZE + 75) * 4]).toBeLessThan(80);
    expect(plate[(94 * SIZE + 110) * 4]).toBeGreaterThan(180);
    expect(plate[(100 * SIZE + 30) * 4]).toBe(150);
  });

  it('spreads only what is known into the rest', () => {
    const rgba = photo((x) => x < 100, 240, 40);
    const known = new Uint8Array(SIZE * SIZE);
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < 100; x++) known[y * SIZE + x] = 1;
    const out = spreadKnown(rgba, known, SIZE, SIZE);
    // The right half was bright, and it is not known: it takes the dark of the left.
    expect(out[(100 * SIZE + 180) * 4]).toBeLessThan(60);
    expect(out[(100 * SIZE + 180) * 4 + 3]).toBe(255);
    expect(out[(100 * SIZE + 20) * 4 + 3]).toBe(0);
  });
});
