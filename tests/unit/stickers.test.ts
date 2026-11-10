import { describe, expect, it } from 'vitest';
import type { Point } from '../../src/core/face/mask';
import { makeFace, type Face, type FaceParts } from '../../src/core/face/scan';
import { placeOnFace } from '../../src/core/fun/anchor';
import { readFace } from '../../src/core/fun/kit';
import { shownSticker } from '../../src/core/fun/place';
import { STICKER_GROUPS, STICKERS, stickerById } from '../../src/core/fun/stickers/index';
import { headOf, pin, poseAt } from '../../src/core/fun/stickers/spots';
import { lens, oval } from './face-fixtures';

/** A face looking at the camera, with every part the stickers hold on to. */
function fullFace(): Face {
  const parts: FaceParts = {
    eyes: [lens(0.4, 0.42, 0.05, 0.02, 16), lens(0.6, 0.42, 0.05, 0.02, 16)],
    irises: [lens(0.4, 0.42, 0.012, 0.012, 4), lens(0.6, 0.42, 0.012, 0.012, 4)],
    innerLips: lens(0.5, 0.65, 0.05, 0.01, 20),
    outerLips: lens(0.5, 0.65, 0.07, 0.02, 20),
    midline: [[0.5, 0.3], [0.5, 0.4], [0.5, 0.5], [0.5, 0.56], [0.5, 0.7]],
    cheeks: [[[0.38, 0.54], [0.36, 0.5], [0.33, 0.46]], [[0.62, 0.54], [0.64, 0.5], [0.67, 0.46]]],
    marks: {
      jawCorners: [[0.32, 0.66], [0.68, 0.66]],
      cheekbones: [[0.29, 0.48], [0.71, 0.48]],
      temples: [[0.3, 0.36], [0.7, 0.36]],
      noseWings: [[0.46, 0.55], [0.54, 0.55]],
      bridge: [0.5, 0.42],
      bridgeMiddle: [0.5, 0.48],
      noseTip: [0.5, 0.55],
      noseBase: [0.5, 0.58],
    },
  };
  return makeFace(oval(0.5, 0.5, 0.22, 0.3), parts);
}

/** Every point of a face moved by `f`. */
function moved(face: Face, f: (p: Point) => Point): Face {
  const list = (ps: readonly Point[]) => ps.map(f);
  const lists = (ls: readonly (readonly Point[])[] | undefined) => ls?.map(list);
  const p = face.parts;
  const m = p.marks!;
  return makeFace(list(face.outline), {
    eyes: lists(p.eyes)!,
    irises: lists(p.irises)!,
    innerLips: list(p.innerLips),
    outerLips: list(p.outerLips),
    midline: p.midline && list(p.midline),
    cheeks: lists(p.cheeks),
    marks: {
      jawCorners: list(m.jawCorners),
      cheekbones: list(m.cheekbones),
      temples: list(m.temples),
      noseWings: list(m.noseWings),
      bridge: f(m.bridge),
      bridgeMiddle: f(m.bridgeMiddle),
      noseTip: f(m.noseTip),
      noseBase: f(m.noseBase),
    },
  });
}

const turn = (a: number, c: Point = [0.5, 0.5]) => ([x, y]: Point): Point => [
  c[0] + (x - c[0]) * Math.cos(a) - (y - c[1]) * Math.sin(a),
  c[1] + (x - c[0]) * Math.sin(a) + (y - c[1]) * Math.cos(a),
];

const FACE = fullFace();
const place = (id: string, face = FACE) => placeOnFace(stickerById(id)!, face, 1000, 1000);
const read = readFace(FACE, 1, 1)!;

describe('the catalogue of stickers', () => {
  it('has the four tabs, each with stickers, and every sticker in one of them', () => {
    expect(STICKER_GROUPS.map((g) => g.id)).toEqual(['oculos', 'cabeca', 'rosto', 'volta']);
    for (const g of STICKER_GROUPS) expect(STICKERS.filter((s) => s.group === g.id).length).toBeGreaterThanOrEqual(3);
    for (const s of STICKERS) expect(STICKER_GROUPS.some((g) => g.id === s.group)).toBe(true);
    expect(STICKERS.length).toBeGreaterThanOrEqual(20);
  });

  it('anchors every sticker on a whole face, not on the fallback', () => {
    for (const s of STICKERS) expect(s.anchor(read), s.id).not.toBeNull();
  });
});

describe('where the stickers sit', () => {
  const eyeY = 0.42;
  const chinY = 0.8;
  const topY = 0.2;

  it('glasses sit on the line of the eyes, upright on an upright face', () => {
    for (const s of STICKERS.filter((d) => d.group === 'oculos')) {
      const p = place(s.id);
      expect(p.angle, s.id).toBeCloseTo(0, 6);
      expect(p.x, s.id).toBeCloseTo(0.5, 6);
      // The middle of the art is near the eyes: each draws its lenses on the line of the eyes.
      expect(Math.abs(p.y - eyeY), s.id).toBeLessThan(0.02);
      expect(p.size, s.id).toBeCloseTo(0.4, 3);
    }
  });

  it('what goes on the head sits above the top of the outline, over the middle, as wide as a head', () => {
    for (const s of STICKERS.filter((d) => d.group === 'cabeca')) {
      const p = place(s.id);
      expect(p.x, s.id).toBeCloseTo(0.5, 6);
      expect(p.y, s.id).toBeLessThan(topY);
      expect(p.size, s.id).toBeGreaterThan(0.44 * 0.4);
      expect(p.size, s.id).toBeLessThan(0.44 * 1.3);
    }
    // The halo floats over the crown, which sits over the outline.
    expect(place('aureola').y).toBeLessThan(place('coroa').y);
  });

  it('the top of the head is above the outline by a share of the face', () => {
    const head = headOf(read);
    expect(head.brow[1]).toBeCloseTo(topY, 6);
    expect(head.top[1]).toBeCloseTo(topY - 0.6 * 0.3, 6);
    // A face narrower than its length says is taken as wide as a head is.
    expect(head.width).toBeCloseTo(0.6 * 0.78, 6);
  });

  it('the mustaches sit between the nose and the mouth, the nose on its tip, the tear under an eye', () => {
    for (const id of ['bigode-classico', 'bigode-guidao', 'bigode-fininho']) {
      const p = place(id);
      expect(p.y, id).toBeGreaterThan(0.56);
      expect(p.y, id).toBeLessThan(0.66);
      expect(p.x, id).toBeCloseTo(0.5, 6);
    }
    expect(place('nariz-palhaco').x).toBeCloseTo(0.5, 6);
    expect(Math.abs(place('nariz-palhaco').y - 0.55)).toBeLessThan(0.01);
    const tear = place('lagrima');
    expect(tear.x).toBeCloseTo(0.4, 6);
    expect(tear.y).toBeGreaterThan(eyeY + 0.02);
    expect(tear.y).toBeLessThan(0.55);
    expect(place('bochechas').y).toBeCloseTo(0.54, 6);
    const freckles = place('sardas');
    expect(freckles.y).toBeGreaterThan(eyeY);
    expect(freckles.y).toBeLessThan(0.55);
  });

  it('what goes around the head has its ring round the head, wider than the face', () => {
    for (const s of STICKERS.filter((d) => d.group === 'volta')) {
      const p = place(s.id);
      expect(p.x, s.id).toBeCloseTo(0.5, 6);
      expect(p.size, s.id).toBeGreaterThan(0.44 * 1.5);
      expect(p.y, s.id).toBeLessThan(chinY);
    }
  });

  it('turn and move with a tilted head, keeping their size', () => {
    const a = 0.35;
    const tilted = moved(FACE, turn(a));
    for (const s of STICKERS) {
      const up = place(s.id);
      const p = place(s.id, tilted);
      const [x, y] = turn(a)([up.x, up.y]);
      expect(p.angle, s.id).toBeCloseTo(a, 4);
      expect(p.x, s.id).toBeCloseTo(x, 4);
      expect(p.y, s.id).toBeCloseTo(y, 4);
      expect(p.size, s.id).toBeCloseTo(up.size, 4);
    }
  });

  it('grow with a bigger face', () => {
    const big = moved(FACE, ([x, y]) => [0.5 + (x - 0.5) * 1.5, 0.5 + (y - 0.5) * 1.5]);
    for (const s of STICKERS) expect(place(s.id, big).size, s.id).toBeCloseTo(place(s.id).size * 1.5, 4);
  });

  it('hold in a photo that is not square', () => {
    // The same face in a photo twice as wide: in UV it is half as wide, and the long side is twice as long.
    const wide = moved(FACE, ([x, y]) => [x / 2, y]);
    const p = placeOnFace(stickerById('coroa')!, wide, 2000, 1000);
    const q = place('coroa');
    expect(p.x * 2).toBeCloseTo(q.x, 4);
    expect(p.y).toBeCloseTo(q.y, 4);
    expect(p.size * 2).toBeCloseTo(q.size, 4);
  });
});

describe('pinning art to a point', () => {
  it('puts the chosen point of the art on the spot, turned with the face', () => {
    const pose = poseAt(0.4);
    const p = pin([0.3, 0.6], pose, 0.2, 0.5, 0.5, 1);
    // From the middle, half the height down along the face is the spot.
    const bottom = [p.x + pose.down[0] * 0.05, p.y + pose.down[1] * 0.05];
    expect(bottom[0]).toBeCloseTo(0.3, 9);
    expect(bottom[1]).toBeCloseTo(0.6, 9);
    expect(p.angle).toBe(0.4);
  });

  it('a sticker on a head grows with the head when a warp grows it', () => {
    const crown = place('coroa');
    // A warp that grows everything around the middle of the face by a half.
    const lookup = (u: number, v: number) => [(0.5 - u) / 3, (0.5 - v) / 3] as const;
    const shown = shownSticker(crown, 1000, 1000, lookup);
    expect(shown.size).toBeCloseTo(crown.size * 1.5, 3);
    expect(shown.y).toBeCloseTo(0.5 + (crown.y - 0.5) * 1.5, 3);
  });
});
