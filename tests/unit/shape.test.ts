import { describe, expect, it } from 'vitest';
import { shapeField } from '../../src/core/face/shape';
import { makeFace } from '../../src/core/face/scan';
import { DisplacementGrid } from '../../src/tools/liquify/grid';
import { lens, oval } from './face-fixtures';

/** A face looking at the camera, in the middle of a square photo. Chin at v = 0.8. */
const FRONT = makeFace(oval(0.5, 0.5, 0.22, 0.3), {
  eyes: [lens(0.4, 0.42, 0.05, 0.02, 16), lens(0.6, 0.42, 0.05, 0.02, 16)],
  irises: [],
  innerLips: [],
  outerLips: [],
  midline: [[0.5, 0.3], [0.5, 0.4], [0.5, 0.5], [0.5, 0.6], [0.5, 0.7]],
});

/** Height of the jaw on the fixture, where the move is at its largest. */
const JAW_V = 0.5 - 0.3 + 0.6 * 0.82;

/** The half width of the fixture at that height. */
const JAW_HALF = 0.22 * Math.sqrt(1 - ((JAW_V - 0.5) / 0.3) ** 2);

describe('shaping a face', () => {
  it('brings the jaw in on both sides, by reading from further out', () => {
    const { offset } = shapeField([FRONT], 1000, 1000, 1);
    const [right] = offset(0.5 + JAW_HALF, JAW_V);
    const [left] = offset(0.5 - JAW_HALF, JAW_V);
    expect(right).toBeGreaterThan(0);
    expect(left).toBeLessThan(0);
    expect(right).toBeCloseTo(-left, 5);
  });

  it('stays subtle at full strength', () => {
    const { offset } = shapeField([FRONT], 1000, 1000, 1);
    let largest = 0;
    for (let v = 0; v <= 1; v += 0.01) {
      for (let u = 0; u <= 1; u += 0.01) largest = Math.max(largest, Math.hypot(...offset(u, v)));
    }
    // The face is 0.44 wide: this is about 3% of its width on each side.
    expect(largest).toBeGreaterThan(0.005);
    expect(largest).toBeLessThan(0.015);
  });

  it('keeps nose and mouth in place', () => {
    const { offset } = shapeField([FRONT], 1000, 1000, 1);
    expect(offset(0.5, JAW_V)[0]).toBeCloseTo(0, 6);
    expect(Math.abs(offset(0.52, JAW_V)[0])).toBeLessThan(0.001);
  });

  it('leaves the forehead and whatever is far from the face', () => {
    const { offset } = shapeField([FRONT], 1000, 1000, 1);
    // Only the far tail of the bell of an eye reaches the forehead.
    expect(Math.hypot(...offset(0.5 + 0.2, 0.25))).toBeLessThan(0.001);
    expect(offset(0.02, 0.02)).toEqual([0, 0]);
    expect(offset(0.5 + JAW_HALF * 2.2, JAW_V)).toEqual([0, 0]);
  });

  it('never folds the photo over itself', () => {
    const { offset } = shapeField([FRONT], 1000, 1000, 1);
    for (const v of [0.45, 0.55, JAW_V, 0.75, 0.85, 0.95]) {
      let previous = -Infinity;
      for (let u = 0; u <= 1; u += 0.002) {
        const read = u + offset(u, v)[0];
        expect(read).toBeGreaterThan(previous);
        previous = read;
      }
    }
  });

  it('opens the eyes a little, by reading from closer to their middle', () => {
    const { offset } = shapeField([FRONT], 1000, 1000, 1);
    const [du] = offset(0.4 + 0.03, 0.42);
    const [dv] = [offset(0.4, 0.42 + 0.03)[1]];
    expect(du).toBeLessThan(0);
    expect(dv).toBeLessThan(0);
    expect(Math.abs(du)).toBeLessThan(0.003);
  });

  it('scales in a straight line with strength, as the slider preview assumes', () => {
    const full = shapeField([FRONT], 1000, 1000, 1).offset(0.5 + JAW_HALF, JAW_V);
    const half = shapeField([FRONT], 1000, 1000, 0.5).offset(0.5 + JAW_HALF, JAW_V);
    expect(half[0]).toBeCloseTo(full[0] * 0.5, 8);

    const a = new DisplacementGrid(64, 64);
    const b = new DisplacementGrid(64, 64);
    const fieldFull = shapeField([FRONT], 1000, 1000, 1);
    const fieldHalf = shapeField([FRONT], 1000, 1000, 0.5);
    a.displace(fieldFull.offset, fieldFull.area);
    b.displace(fieldHalf.offset, fieldHalf.area);
    for (let i = 0; i < a.data.length; i++) expect(b.data[i]).toBeCloseTo(a.data[i] * 0.5, 6);
  });

  it('is round in pixels on a photo that is not square', () => {
    // The same face, on a photo twice as tall: half as tall in UV, as wide in UV.
    const tall = makeFace(
      FRONT.outline.map(([u, v]) => [u, v / 2]),
      { ...FRONT.parts, eyes: FRONT.parts.eyes.map((eye) => eye.map(([u, v]) => [u, v / 2])), midline: FRONT.parts.midline!.map(([u, v]) => [u, v / 2]) },
    );
    const [du, dv] = shapeField([tall], 1000, 2000, 1).offset(0.5 + JAW_HALF, JAW_V / 2);
    const [su, sv] = shapeField([FRONT], 1000, 1000, 1).offset(0.5 + JAW_HALF, JAW_V);
    // The long side doubled, so the same shape in pixels is half the size in shares of it.
    expect(du).toBeCloseTo(su, 5);
    expect(dv).toBeCloseTo(sv / 2, 5);
  });

  it('follows the axes of a tilted head', () => {
    // Rotated a quarter turn around the middle of the photo: the jaw now moves up and down.
    const turn = ([u, v]: readonly [number, number]): [number, number] => [0.5 - (v - 0.5), 0.5 + (u - 0.5)];
    const tilted = makeFace(FRONT.outline.map(turn), {
      ...FRONT.parts,
      eyes: FRONT.parts.eyes.map((eye) => eye.map(turn)),
      midline: FRONT.parts.midline!.map(turn),
    });
    const [u, v] = turn([0.5 + JAW_HALF, JAW_V]);
    const [du, dv] = shapeField([tilted], 1000, 1000, 1).offset(u, v);
    const [su] = shapeField([FRONT], 1000, 1000, 1).offset(0.5 + JAW_HALF, JAW_V);
    expect(Math.abs(dv)).toBeCloseTo(Math.abs(su), 3);
    expect(Math.abs(du)).toBeLessThan(0.0005);
  });

  it('moves the far side of a turned head less', () => {
    // The nose sits toward one side, which is what a turned head looks like.
    const turned = makeFace(FRONT.outline, { ...FRONT.parts, midline: FRONT.parts.midline!.map(([u, v]) => [u + 0.09, v]) });
    const { offset } = shapeField([turned], 1000, 1000, 1);
    const near = Math.abs(offset(0.5 - JAW_HALF, JAW_V)[0]);
    const far = Math.abs(offset(0.5 + JAW_HALF, JAW_V)[0]);
    expect(far).toBeLessThan(near * 0.6);
  });

  it('adds up the faces of a group, each on its own', () => {
    const left = makeFace(oval(0.25, 0.5, 0.1, 0.14));
    const right = makeFace(oval(0.75, 0.5, 0.1, 0.14));
    const { offset } = shapeField([left, right], 1000, 1000, 1);
    const jaw = 0.36 + 0.28 * 0.82;
    const half = 0.1 * Math.sqrt(1 - ((jaw - 0.5) / 0.14) ** 2);
    expect(offset(0.25 + half, jaw)[0]).toBeGreaterThan(0);
    expect(offset(0.75 + half, jaw)[0]).toBeGreaterThan(0);
    expect(offset(0.5, jaw)).toEqual([0, 0]);
  });

  it('does not smear the edge of the photo, for a face that touches it', () => {
    const cut = makeFace(oval(0.1, 0.5, 0.22, 0.3));
    const { offset } = shapeField([cut], 1000, 1000, 1);
    expect(Math.hypot(...offset(0, JAW_V))).toBe(0);
  });

  it('does nothing without faces, or with an outline that has no height', () => {
    const none = shapeField([], 1000, 1000, 1);
    expect(none.offset(0.5, 0.5)).toEqual([0, 0]);
    const flat = makeFace(Array.from({ length: 36 }, () => [0.5, 0.5] as [number, number]));
    expect(shapeField([flat], 1000, 1000, 1).offset(0.5, 0.5)).toEqual([0, 0]);
  });

  it('never gives a bad number', () => {
    const { offset } = shapeField([FRONT], 1000, 1000, 1);
    for (let v = -0.01; v <= 1.01; v += 0.03) {
      for (let u = -0.01; u <= 1.01; u += 0.03) {
        const [du, dv] = offset(u, v);
        expect(Number.isFinite(du) && Number.isFinite(dv)).toBe(true);
      }
    }
  });
});
