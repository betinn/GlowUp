import { describe, expect, it } from 'vitest';
import {
  applyMat3,
  constrainCrop,
  cropInside,
  defaultCrop,
  imageToOutput,
  largestInscribed,
  outputSize,
  outputToImage,
  rotatedBounds,
  sourceBounds,
} from '../../src/core/geometry';

const W = 400;
const H = 300;

describe('crop geometry', () => {
  it('is the identity by default', () => {
    const m = outputToImage(defaultCrop(W, H), W, H);
    expect(applyMat3(m, 0, 0)).toEqual([0, 0]);
    expect(applyMat3(m, 1, 1)).toEqual([1, 1]);
    expect(applyMat3(m, 0.25, 0.75)).toEqual([0.25, 0.75]);
  });

  it('maps a crop to the right part of the image', () => {
    const crop = { ...defaultCrop(W, H), cx: 100, cy: 50, cw: 100, ch: 100 };
    const [u, v] = applyMat3(outputToImage(crop, W, H), 0.5, 0.5);
    expect(u * W).toBeCloseTo(300);
    expect(v * H).toBeCloseTo(200);
  });

  it('flips horizontally', () => {
    const crop = { ...defaultCrop(W, H), flipH: true };
    const [u, v] = applyMat3(outputToImage(crop, W, H), 0, 0);
    expect(u).toBeCloseTo(1);
    expect(v).toBeCloseTo(0);
  });

  it('turns clockwise by a quarter', () => {
    const crop = { ...defaultCrop(W, H), quarter: 1, cw: H, ch: W };
    // The top-left of the output shows the bottom-left of the image.
    const [u, v] = applyMat3(outputToImage(crop, W, H), 0, 0);
    expect(u).toBeCloseTo(0);
    expect(v).toBeCloseTo(1);
    expect(outputSize(crop)).toEqual({ w: H, h: W });
  });

  it('inverts exactly', () => {
    const crop = { ...defaultCrop(W, H), angle: 12, flipV: true, cx: 10, cy: -20, cw: 200, ch: 120 };
    const fwd = outputToImage(crop, W, H);
    const inv = imageToOutput(crop, W, H);
    const [u, v] = applyMat3(fwd, 0.3, 0.8);
    const [s, t] = applyMat3(inv, u, v);
    expect(s).toBeCloseTo(0.3);
    expect(t).toBeCloseTo(0.8);
  });

  it('computes rotated bounds', () => {
    const b = rotatedBounds(W, H, { angle: 0, quarter: 1 });
    expect(b.w).toBeCloseTo(H);
    expect(b.h).toBeCloseTo(W);
  });

  it('finds an inscribed rectangle that stays inside when rotated', () => {
    for (const angle of [-40, -13, 5, 27, 45]) {
      const r = { angle, quarter: 0 };
      const fit = largestInscribed(W, H, r, W / H);
      const crop = { ...defaultCrop(W, H), angle, cw: fit.cw, ch: fit.ch };
      expect(cropInside(crop, W, H)).toBe(true);
      expect(fit.cw / fit.ch).toBeCloseTo(W / H);
    }
  });

  it('constrains a crop that leaves the image', () => {
    const c = constrainCrop({ ...defaultCrop(W, H), cx: 500, cy: 0, cw: 100, ch: 100 }, W, H);
    expect(cropInside(c, W, H)).toBe(true);
    expect(c.cw).toBe(100);
  });

  it('reports the source area for an output tile', () => {
    const b = sourceBounds(defaultCrop(W, H), W, H, 0.5, 0, 1, 0.5);
    expect(b).toEqual({ x0: 200, y0: 0, x1: 400, y1: 150 });
  });
});
