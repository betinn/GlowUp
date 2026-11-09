import { describe, expect, it, vi } from 'vitest';
import { CHIN_WORDS, readChin } from '../../src/core/face/chin';
import { faceAt, hasValues, reshapeField, SHAPE_SLIDERS, sliderById } from '../../src/core/face/reshape';
import { makeFace, type Face } from '../../src/core/face/scan';
import { createField } from '../../src/tools/liquify/index';
import type { GLContext } from '../../src/core/gl/context';
import { lens, oval } from './face-fixtures';

/** A face looking at the camera, in the middle of a square photo. Chin at v = 0.8, top at v = 0.2. */
const FRONT: Face = makeFace(oval(0.5, 0.5, 0.22, 0.3), {
  // The first point of each eye is its outer corner, as in the list of the model.
  eyes: [lens(0.4, 0.42, 0.05, 0.02, 16), lens(0.4, 0.42, 0.05, 0.02, 16).map(([x, y]) => [1 - x, y] as const)],
  irises: [lens(0.4, 0.42, 0.012, 0.012, 4), lens(0.6, 0.42, 0.012, 0.012, 4)],
  innerLips: lens(0.5, 0.65, 0.05, 0.01, 20),
  outerLips: lens(0.5, 0.65, 0.07, 0.02, 20),
  brows: [lens(0.4, 0.36, 0.06, 0.01, 10), lens(0.6, 0.36, 0.06, 0.01, 10)],
  midline: [[0.5, 0.3], [0.5, 0.4], [0.5, 0.5], [0.5, 0.6], [0.5, 0.7]],
  marks: {
    jawCorners: [[0.33, 0.68], [0.67, 0.68]],
    cheekbones: [[0.3, 0.55], [0.7, 0.55]],
    temples: [[0.3, 0.38], [0.7, 0.38]],
    noseWings: [[0.46, 0.57], [0.54, 0.57]],
    bridge: [0.5, 0.42],
    bridgeMiddle: [0.5, 0.48],
    noseTip: [0.5, 0.55],
    noseBase: [0.5, 0.58],
  },
});

const place = (values: Record<string, number>) => [{ at: [0.5, 0.5] as [number, number], values }];
const field = (values: Record<string, number>, off: ('face' | 'eyes' | 'nose')[] = []) => reshapeField([FRONT], place(values), off, 1000, 1000);

describe('the sliders', () => {
  it('each one has a name, its way of going, and comes from the same list', () => {
    expect(new Set(SHAPE_SLIDERS.map((s) => s.id)).size).toBe(SHAPE_SLIDERS.length);
    expect(sliderById('doubleChin')?.min).toBe(0);
    expect(sliderById('head')?.min).toBe(-100);
    for (const s of SHAPE_SLIDERS) expect(s.label).toBeTruthy();
    expect(hasValues({})).toBe(false);
    expect(hasValues({ head: 0 })).toBe(false);
    expect(hasValues({ head: 1 })).toBe(true);
  });

  it('at zero, moves nothing anywhere', () => {
    const all = Object.fromEntries(SHAPE_SLIDERS.map((s) => [s.id, 0]));
    const { offset } = field(all);
    for (const [u, v] of [[0.5, 0.5], [0.33, 0.68], [0.4, 0.42], [0.5, 0.55], [0.1, 0.1]]) expect(offset(u, v)).toEqual([0, 0]);
  });

  it('at every value of every slider, moves something and stays finite', () => {
    for (const s of SHAPE_SLIDERS) {
      if (s.id === 'doubleChin') continue;
      for (const value of [s.min === 0 ? 50 : -100, 100]) {
        const { offset, area } = field({ [s.id]: value });
        let largest = 0;
        for (let i = 0; i <= 40; i++) {
          for (let j = 0; j <= 40; j++) {
            const [du, dv] = offset(i / 40, j / 40);
            expect(Number.isFinite(du) && Number.isFinite(dv)).toBe(true);
            largest = Math.max(largest, Math.abs(du), Math.abs(dv));
          }
        }
        expect(largest, s.id).toBeGreaterThan(0);
        expect(area.u1).toBeGreaterThanOrEqual(area.u0);
      }
    }
  });

  it('reads from further out for a narrower jaw, and the other way for a wider one', () => {
    const narrower = field({ jawline: -100 }).offset(0.72, 0.62)[0];
    const wider = field({ jawline: 100 }).offset(0.72, 0.62)[0];
    expect(narrower).toBeGreaterThan(0);
    expect(wider).toBeCloseTo(-narrower, 5);
  });

  it('moves both sides the same on a face looking at the camera', () => {
    const { offset } = field({ temples: 100 });
    expect(offset(0.3, 0.38)[0]).toBeCloseTo(-offset(0.7, 0.38)[0], 5);
    expect(offset(0.3, 0.38)[0]).not.toBe(0);
  });

  it('a bigger eye reads from closer to its middle', () => {
    const { offset } = field({ eyeSize: 100 });
    expect(offset(0.43, 0.42)[0]).toBeLessThan(0);
    expect(offset(0.37, 0.42)[0]).toBeGreaterThan(0);
  });

  it('opening an eye works up and down only', () => {
    const { offset } = field({ eyeOpen: 100 });
    const [du, dv] = offset(0.4, 0.4);
    expect(Math.abs(du)).toBeLessThan(1e-9);
    expect(dv).toBeGreaterThan(0);
  });

  it('turns both eyes as mirror images', () => {
    const { offset } = field({ eyeAngle: 100 });
    // The outer corner of each eye goes up, so it reads from below it.
    expect(offset(0.36, 0.42)[1]).toBeGreaterThan(0);
    expect(offset(0.64, 0.42)[1]).toBeGreaterThan(0);
    expect(offset(0.36, 0.42)[1]).toBeCloseTo(offset(0.64, 0.42)[1], 5);
  });

  it('grows the pupil inside the iris and stops at its edge', () => {
    const { offset } = field({ pupil: 100 });
    const near = offset(0.404, 0.42)[0];
    expect(near).toBeLessThan(0);
    expect(offset(0.414, 0.42)).toEqual([0, 0]);
  });

  it('a longer face moves the chin down and leaves the line of the eyes', () => {
    const { offset } = field({ length: 100 });
    expect(offset(0.5, 0.78)[1]).toBeLessThan(0);
    expect(Math.abs(offset(0.5, 0.2 + 0.6 * 0.42)[1])).toBeLessThan(1e-3);
  });

  it('a taller forehead reads from below, and stops at the brows', () => {
    const { offset } = field({ forehead: 100 });
    expect(offset(0.5, 0.25)[1]).toBeGreaterThan(0);
    expect(offset(0.5, 0.2 + 0.6 * 0.31)[1]).toBe(0);
  });

  it('a bigger head reads toward the neck, and the shoulders stay', () => {
    const { offset } = field({ head: 100 });
    const top = offset(0.5, 0.2);
    expect(top[1]).toBeGreaterThan(0);
    // Level with the shoulders, far to the side of the neck, nothing moves.
    expect(offset(0.05, 0.9)).toEqual([0, 0]);
    expect(Math.abs(offset(0.5, 0.98)[1])).toBeLessThan(0.002);
  });

  it('keeps the nose out unless a slider of the nose moved', () => {
    const { offset } = field({ jawline: 100, eyeSize: 40, forehead: 50 });
    const tip = offset(0.5, 0.55);
    expect(Math.abs(tip[0])).toBeLessThan(1e-4);
    const nose = field({ noseWidth: 100 }).offset(0.54, 0.57);
    expect(Math.abs(nose[0])).toBeGreaterThan(1e-3);
  });

  it('a section that is off counts as zero, and only that section', () => {
    expect(field({ eyeSize: 100 }, ['eyes']).offset(0.43, 0.42)).toEqual([0, 0]);
    expect(field({ eyeSize: 100 }, ['face']).offset(0.43, 0.42)[0]).not.toBe(0);
  });

  it('does not depend on what the sliders were before: same numbers, same field', () => {
    const a = field({ jawline: 40, head: -30 });
    field({ jawline: 90 });
    const b = field({ jawline: 40, head: -30 });
    for (const [u, v] of [[0.3, 0.6], [0.5, 0.2], [0.6, 0.7]]) expect(a.offset(u, v)).toEqual(b.offset(u, v));
  });

  it('never reads past the edge of the photo', () => {
    const near = makeFace(oval(0.25, 0.35, 0.22, 0.3), { ...FRONT.parts });
    const { offset } = reshapeField([near], [{ at: [0.25, 0.35], values: { head: -100 } }], [], 1000, 1000);
    for (let i = 0; i <= 50; i++) {
      for (let j = 0; j <= 50; j++) {
        const u = i / 50;
        const v = j / 50;
        const [du, dv] = offset(u, v);
        expect(u + du).toBeGreaterThanOrEqual(0);
        expect(v + dv).toBeGreaterThanOrEqual(0);
        expect(u + du).toBeLessThanOrEqual(1);
        expect(v + dv).toBeLessThanOrEqual(1);
      }
    }
  });

  it('finds the face its numbers belong to, and only if it is still there', () => {
    const other = makeFace(oval(0.15, 0.2, 0.05, 0.07));
    expect(faceAt([FRONT, other], [0.5, 0.5])).toBe(FRONT);
    expect(faceAt([FRONT, other], [0.15, 0.2])).toBe(other);
    expect(faceAt([other], [0.8, 0.8])).toBeNull();
    // Numbers of a face that is not on the list move nothing.
    expect(reshapeField([other], place({ head: 100 }), [], 1000, 1000).offset(0.5, 0.3)).toEqual([0, 0]);
  });

  it('moves only the chosen face', () => {
    const other = makeFace(oval(0.15, 0.2, 0.05, 0.07), { ...FRONT.parts, marks: undefined });
    const { offset } = reshapeField([FRONT, other], place({ jawline: 100 }), [], 1000, 1000);
    expect(offset(0.15, 0.2)).toEqual([0, 0]);
    expect(offset(0.72, 0.62)[0]).not.toBe(0);
  });
});

describe('the double chin', () => {
  /** A neck: light skin with a band of a given luma per height, or anything else from `custom`. */
  const pixelOf = (band: (v: number) => number) => (_u: number, v: number): readonly [number, number, number] => {
    const k = band(v);
    return [230 * k, 180 * k, 150 * k];
  };

  it('sees a fold: lighter, then darker, then lighter again, on both sides', () => {
    // The chin is at v = 0.8 and the face is 0.6 tall: heights 1.05, 1.15 and 1.25 are at 0.83, 0.89 and 0.95.
    const reading = readChin(FRONT, 1000, 1200, pixelOf((v) => (v > 0.87 && v < 0.91 ? 0.85 : 1)));
    expect(reading.seen).toBe(true);
    if (reading.seen) {
      expect(reading.fold.fold).toBeGreaterThan(1.05);
      expect(reading.fold.fold).toBeLessThan(1.3);
    }
  });

  it('a shadow that only gets lighter on the way down is no fold', () => {
    const reading = readChin(FRONT, 1000, 1200, pixelOf((v) => Math.min(1, 0.6 + (v - 0.8) * 2)));
    expect(reading).toEqual({ seen: false, why: CHIN_WORDS.none });
  });

  it('says why when the chin is at the edge of the photo', () => {
    const low = makeFace(oval(0.5, 0.75, 0.22, 0.2), FRONT.parts);
    expect(readChin(low, 1000, 1000, pixelOf(() => 1))).toEqual({ seen: false, why: CHIN_WORDS.edge });
  });

  it('says why when the neck is covered', () => {
    const shirt = () => [20, 60, 200] as const;
    const face = readChin(FRONT, 1000, 1200, (_u, v) => (v > 0.8 ? shirt() : [230, 180, 150]));
    expect(face).toEqual({ seen: false, why: CHIN_WORDS.covered });
  });

  it('says why when the head is turned too far', () => {
    const marks = { ...FRONT.parts.marks!, noseTip: [0.68, 0.55] as const };
    const turned = makeFace(FRONT.outline, { ...FRONT.parts, marks });
    expect(readChin(turned, 1000, 1200, pixelOf(() => 1))).toEqual({ seen: false, why: CHIN_WORDS.turned });
  });

  it('moves nothing without a fold, and lifts the fold with one', () => {
    expect(field({ doubleChin: 100 }).offset(0.5, 0.86)).toEqual([0, 0]);
    const seen = { ...FRONT, chin: { from: 0.98, fold: 1.15 } };
    const { offset } = reshapeField([seen], place({ doubleChin: 100 }), [], 1000, 1000);
    expect(offset(0.5, 0.2 + 0.6 * 1.1)[1]).toBeGreaterThan(0);
    expect(offset(0.5, 0.5)).toEqual([0, 0]);
  });
});

describe('the field with the brush and the sliders', () => {
  const fakeGl = () =>
    ({
      createTex: () => ({ w: 1, h: 1, tex: {}, fbo: null, format: 'rg16f', levels: 1 }),
      destroyTex: vi.fn(),
      upload: vi.fn(),
    }) as unknown as GLContext;
  const source = (values: Record<string, number>) => ({ amount: undefined, shapes: place(values), off: [] as ('face' | 'eyes' | 'nose')[], faces: [FRONT], w: 512, h: 512 });
  const stroke = { mode: 'push', radius: 0.05, strength: 0.8, path: [[0.3, 0.5], [0.4, 0.5]] as const };

  it('adds no error: back at a number, the field is what it was', () => {
    const f = createField(fakeGl(), 512, 512);
    f.setShape(source({ jawline: 30 }));
    const first = f.lookup(0.7, 0.62);
    for (const v of [80, -100, 12, 55]) f.setShape(source({ jawline: v }));
    f.setShape(source({ jawline: 30 }));
    expect(f.lookup(0.7, 0.62)).toEqual(first);
    expect(first[0]).not.toBe(0);
  });

  it('takes it all off with no trace', () => {
    const f = createField(fakeGl(), 512, 512);
    f.setShape(source({ head: 100 }));
    expect(f.isEmpty()).toBe(false);
    f.setShape(null);
    expect(f.isEmpty()).toBe(true);
    expect(f.maxDisplacement()).toBe(0);
  });

  it('keeps the strokes of the brush apart, so a slider never changes them', async () => {
    const f = createField(fakeGl(), 512, 512);
    const entry = f.apply({ strokes: [stroke] }, 'Liquify')!;
    const strokes = f.serialize().slice();
    f.setShape(source({ jawline: 100 }));
    expect(f.serialize()).toEqual(strokes);
    expect(f.brushEmpty()).toBe(false);
    // And the undo of the stroke leaves the slider.
    await entry.undo();
    expect(f.brushEmpty()).toBe(true);
    expect(f.isEmpty()).toBe(false);
  });

  it('reads the brush first, then the shape, because the stroke was made on what the screen showed', () => {
    const f = createField(fakeGl(), 512, 512);
    f.setShape(source({ head: 100 }));
    const alone = f.lookup(0.5, 0.3);
    f.apply({ offset: (u, v) => (Math.abs(u - 0.5) < 0.2 && Math.abs(v - 0.3) < 0.2 ? [0.02, 0] : [0, 0]) }, 'Liquify');
    const both = f.lookup(0.5, 0.3);
    expect(both[0]).toBeCloseTo(0.02 + alone[0], 2);
    expect(both[1]).not.toBe(0);
  });

  it('saves and brings back what the document asked for, with no detector', () => {
    const f = createField(fakeGl(), 512, 512);
    f.setShape(source({ head: 60 }));
    const data = f.shapeData()!.slice();
    const at = f.lookup(0.5, 0.25);
    const other = createField(fakeGl(), 512, 512);
    other.restoreShape(data);
    expect(other.lookup(0.5, 0.25)).toEqual(at);
    expect(other.brushEmpty()).toBe(true);
    expect(other.isEmpty()).toBe(false);
  });

  it('has a texture for the brush only while the background moves with it', () => {
    const gl = fakeGl();
    const f = createField(gl, 512, 512);
    expect(f.brushTex).toBeNull();
    f.setBrushOnBackground(true);
    expect(f.brushTex).not.toBeNull();
    f.setBrushOnBackground(false);
    expect(f.brushTex).toBeNull();
    expect(gl.destroyTex).toHaveBeenCalledOnce();
  });
});
