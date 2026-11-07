import { describe, expect, it } from 'vitest';
import { StrokeInterpolator, TileTracker } from '../../src/core/brush';

describe('stroke interpolator', () => {
  it('starts with a dab at the first point', () => {
    const s = new StrokeInterpolator(10, 0.5);
    const dabs = s.add({ x: 5, y: 6, pressure: 1 });
    expect(dabs).toHaveLength(1);
    expect(dabs[0]).toMatchObject({ x: 5, y: 6, radius: 10, flow: 0.5 });
  });

  it('spaces dabs evenly along the path', () => {
    const s = new StrokeInterpolator(20, 1, 0.25, 0);
    s.add({ x: 0, y: 0, pressure: 1 });
    const dabs = s.add({ x: 100, y: 0, pressure: 1 });
    expect(dabs).toHaveLength(20);
    for (let i = 1; i < dabs.length; i++) expect(dabs[i].x - dabs[i - 1].x).toBeCloseTo(5);
  });

  it('keeps spacing across several small moves', () => {
    const s = new StrokeInterpolator(20, 1, 0.25, 0);
    s.add({ x: 0, y: 0, pressure: 1 });
    const xs: number[] = [];
    for (let x = 1; x <= 40; x++) xs.push(...s.add({ x, y: 0, pressure: 1 }).map((d) => d.x));
    expect(xs.length).toBe(8);
    xs.forEach((x, i) => expect(x).toBeCloseTo((i + 1) * 5));
  });

  it('scales radius with pen pressure', () => {
    const s = new StrokeInterpolator(10, 1);
    expect(s.add({ x: 0, y: 0, pressure: 0 })[0].radius).toBeCloseTo(4);
  });
});

describe('tile tracker', () => {
  it('marks only touched tiles and clips to the image', () => {
    const t = new TileTracker(300, 200, 128);
    expect(t.empty).toBe(true);
    t.mark(120, 10, 140, 20);
    t.mark(-50, -50, -10, -10);
    expect(t.tiles()).toEqual([
      { x: 0, y: 0, w: 128, h: 128 },
      { x: 128, y: 0, w: 128, h: 128 },
    ]);
    expect(t.bounds).toEqual({ x: 120, y: 10, w: 20, h: 10 });
  });

  it('gives edge tiles their real size', () => {
    const t = new TileTracker(300, 200, 128);
    t.mark(290, 190, 300, 200);
    expect(t.tiles()).toEqual([{ x: 256, y: 128, w: 44, h: 72 }]);
  });
});
