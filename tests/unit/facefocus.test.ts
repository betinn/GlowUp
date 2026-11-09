import { describe, expect, it } from 'vitest';
import { faceFocus } from '../../src/core/face/facefocus';
import { makeFace } from '../../src/core/face/scan';
import { defaultCrop, type Crop } from '../../src/core/geometry';
import { oval } from './face-fixtures';

const W = 1000;
const H = 2000;

describe('the focus of the automatic Desfoque', () => {
  it('has nothing to say without faces', () => {
    expect(faceFocus([], defaultCrop(W, H), W, H)).toBeNull();
  });

  it('goes to the face, a little above its middle, and not to the middle of the photo', () => {
    const face = makeFace(oval(0.3, 0.25, 0.1, 0.05));
    const focus = faceFocus([face], defaultCrop(W, H), W, H)!;
    expect(focus.cx).toBeCloseTo(0.3, 2);
    expect(focus.cy).toBeLessThan(0.25);
    expect(focus.cy).toBeGreaterThan(0.22);
  });

  it('takes in the whole head, in shares of the long side', () => {
    // The face is 200 pixels tall on a photo 2000 long.
    const face = makeFace(oval(0.5, 0.5, 0.1, 0.05));
    const { focus, feather } = faceFocus([face], defaultCrop(W, H), W, H)!;
    expect(focus).toBeCloseTo(0.08, 3);
    expect(feather).toBeGreaterThanOrEqual(0.08);
  });

  it('keeps its limits on a face that fills the photo', () => {
    const face = makeFace(oval(0.5, 0.5, 0.48, 0.48));
    const { focus, feather } = faceFocus([face], defaultCrop(W, W), W, W)!;
    expect(focus).toBeLessThanOrEqual(0.7);
    expect(feather).toBeLessThanOrEqual(0.4);
  });

  it('holds every face that matters, and leaves out one far in the background', () => {
    const a = makeFace(oval(0.2, 0.5, 0.1, 0.05));
    const b = makeFace(oval(0.8, 0.5, 0.1, 0.05));
    const far = makeFace(oval(0.5, 0.9, 0.01, 0.005));
    const focus = faceFocus([a, b, far], defaultCrop(W, H), W, H)!;
    expect(focus.cx).toBeCloseTo(0.5, 2);
    expect(focus.cy).toBeLessThan(0.5);
    expect(focus.focus).toBeGreaterThan(0.2);
    expect(focus).toEqual(faceFocus([a, b], defaultCrop(W, H), W, H));
  });

  it('follows the crop', () => {
    const face = makeFace(oval(0.5, 0.25, 0.1, 0.05));
    const whole = defaultCrop(W, H);
    // Only the top half of the photo stays.
    const crop: Crop = { ...whole, cy: -500, ch: 1000 };
    const focus = faceFocus([face], crop, W, H)!;
    expect(focus.cy).toBeLessThan(0.5);
    expect(focus.cy).toBeGreaterThan(0.42);
    expect(focus.focus).toBeCloseTo(0.16, 3);
  });
});
