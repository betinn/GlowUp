import { describe, expect, it } from 'vitest';
import { addHair, faceSize, hairCrop, lookAlike, type HairCut } from '../../src/core/face/hair';

/** A cut that is sure of hair inside a box given as shares of its sides, and of nothing outside. */
function cutWith(x0: number, y0: number, x1: number, y1: number, side = 64, inside = 1): HairCut {
  const data = new Float32Array(side * side);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const fx = (x + 0.5) / side;
      const fy = (y + 0.5) / side;
      if (fx >= x0 && fx < x1 && fy >= y0 && fy < y1) data[y * side + x] = inside;
    }
  }
  return { data, w: side, h: side };
}

describe('hairCrop', () => {
  it('is a square around the head, a little low for long hair', () => {
    const face = { x: 0.45, y: 0.45, w: 0.1, h: 0.1 };
    const crop = hairCrop(face, 1000, 1000);
    expect(crop.w).toBe(320);
    expect(crop.h).toBe(320);
    expect(crop.x + crop.w / 2).toBeCloseTo(500, 0);
    // Below the center of the face.
    expect(crop.y + crop.h / 2).toBeGreaterThan(500);
  });

  it('slides inside the photo near an edge, keeping its size', () => {
    const crop = hairCrop({ x: 0, y: 0, w: 0.1, h: 0.1 }, 1000, 1000);
    expect(crop).toEqual({ x: 0, y: 0, w: 320, h: 320 });
  });

  it('only shrinks when the photo is smaller than the square', () => {
    const crop = hairCrop({ x: 0.3, y: 0.2, w: 0.4, h: 0.4 }, 1000, 800);
    expect(crop.x).toBe(0);
    expect(crop.w).toBe(1000);
    expect(crop.h).toBe(800);
  });
});

describe('addHair', () => {
  const target = { w: 100, h: 100 };

  it('puts the hair of the cut where the crop sits', () => {
    const out = new Uint8Array(100 * 100);
    const area = { x: 20, y: 10, w: 60, h: 60 };
    const found = addHair(out, target, area, cutWith(0, 0, 1, 0.5), faceSize({ x: 0.4, y: 0.3, w: 0.2, h: 0.2 }, 100, 100));
    expect(out[20 * 100 + 50]).toBe(255);
    expect(out[60 * 100 + 50]).toBe(0);
    expect(out[20 * 100 + 10]).toBe(0);
    expect(found).toBe(true);
  });

  it('keeps the larger value where two heads overlap', () => {
    const out = new Uint8Array(100 * 100);
    out[30 * 100 + 50] = 200;
    out[80 * 100 + 50] = 90;
    addHair(out, target, { x: 0, y: 0, w: 100, h: 100 }, cutWith(0, 0, 1, 0.5), 30);
    expect(out[30 * 100 + 50]).toBe(255);
    expect(out[80 * 100 + 50]).toBe(90);
  });

  it('finds nothing in a cut that is unsure everywhere', () => {
    const out = new Uint8Array(100 * 100);
    expect(addHair(out, target, { x: 0, y: 0, w: 100, h: 100 }, cutWith(0, 0, 1, 1, 64, 0.2), 30)).toBe(false);
    expect(out.every((v) => v === 0)).toBe(true);
  });

  it('never lets the refinement spread past what the segmenter saw', () => {
    const out = new Uint8Array(100 * 100);
    // Flat photo: the guided filter alone would let the edge drift.
    const flat = { ...target, luma: (a: { w: number; h: number }) => new Float32Array(a.w * a.h).fill(0.2) };
    addHair(out, flat, { x: 0, y: 0, w: 100, h: 100 }, cutWith(0, 0, 0.5, 1), 30);
    expect(out[50 * 100 + 25]).toBeGreaterThan(200);
    expect(out[50 * 100 + 60]).toBe(0);
  });
});

describe('lookAlike', () => {
  it('turns unsure pixels as dark as the sure hair into hair, and leaves bright skin', () => {
    const n = 200;
    const shape = new Float32Array(n);
    const reach = new Float32Array(n).fill(1);
    const luma = new Float32Array(n);
    for (let i = 0; i < 100; i++) {
      shape[i] = 1;
      luma[i] = 0.2 + (i % 5) * 0.01;
    }
    // Unsure: dark like the hair, darker shade, and skin.
    luma[150] = 0.22;
    luma[151] = 0.15;
    luma[152] = 0.7;
    lookAlike(shape, reach, luma);
    expect(shape[150]).toBeGreaterThan(0.9);
    expect(shape[151]).toBeGreaterThan(0.5);
    expect(shape[152]).toBeLessThan(0.01);
  });

  it('stays away where the segmenter saw nothing', () => {
    const shape = new Float32Array(200);
    const reach = new Float32Array(200);
    const luma = new Float32Array(200).fill(0.2);
    for (let i = 0; i < 100; i++) {
      shape[i] = 1;
      reach[i] = 1;
    }
    lookAlike(shape, reach, luma);
    expect(shape[150]).toBe(0);
  });

  it('does nothing with too little sure hair to learn from', () => {
    const shape = new Float32Array(200);
    shape[0] = 1;
    const reach = new Float32Array(200).fill(1);
    lookAlike(shape, reach, new Float32Array(200).fill(0.2));
    expect(shape[1]).toBe(0);
  });
});
