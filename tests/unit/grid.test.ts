import { describe, expect, it } from 'vitest';
import { DisplacementGrid } from '../../src/tools/liquify/grid';

const SIZE = 128;

describe('liquify grid', () => {
  it('starts empty and reads zero', () => {
    const g = new DisplacementGrid(SIZE, SIZE);
    expect(g.isEmpty()).toBe(true);
    expect(g.sample(0.5, 0.5)).toEqual([0, 0]);
  });

  it('push moves content along the stroke', () => {
    const g = new DisplacementGrid(SIZE, SIZE);
    g.dab('push', 64, 64, 20, 1, 8, 0);
    const [du] = g.sample(0.5, 0.5);
    // Output at the center now shows what was to the left of it.
    expect(du).toBeLessThan(0);
    expect(du * SIZE).toBeCloseTo(-8, 0);
  });

  it('only changes cells inside the brush', () => {
    const g = new DisplacementGrid(SIZE, SIZE);
    g.dab('push', 64, 64, 10, 1, 4, 0);
    expect(g.sample(10 / SIZE, 10 / SIZE)).toEqual([0, 0]);
  });

  it('bloat points outward and pinch inward', () => {
    const b = new DisplacementGrid(SIZE, SIZE);
    b.dab('bloat', 64, 64, 30, 1);
    const p = new DisplacementGrid(SIZE, SIZE);
    p.dab('pinch', 64, 64, 30, 1);
    const right = (64 + 10.5) / SIZE;
    const mid = 64.5 / SIZE;
    expect(b.sample(right, mid)[0]).toBeLessThan(0);
    expect(p.sample(right, mid)[0]).toBeGreaterThan(0);
  });

  it('restore brings the field back to zero', () => {
    const g = new DisplacementGrid(SIZE, SIZE);
    g.dab('push', 64, 64, 20, 1, 6, 3);
    for (let i = 0; i < 80; i++) g.dab('restore', 64, 64, 40, 1);
    expect(g.maxDisplacement()).toBeLessThan(1e-4);
  });

  it('undoes through tile snapshots', () => {
    const g = new DisplacementGrid(SIZE, SIZE);
    g.dab('push', 40, 40, 12, 1, 5, 5);
    g.takeSnapshot();
    const reference = g.data.slice();
    g.dab('push', 80, 80, 25, 1, -7, 2);
    let tiles = g.takeSnapshot();
    expect(tiles.length).toBeGreaterThan(0);
    const changed = g.data.slice();
    tiles = g.swap(tiles);
    expect(g.data).toEqual(reference);
    g.swap(tiles);
    expect(g.data).toEqual(changed);
  });

  it('stays smooth across a long stroke: no folded cells', () => {
    const g = new DisplacementGrid(SIZE, SIZE);
    for (let x = 30; x < 100; x += 2) g.dab('push', x, 64, 18, 0.6, 2, 0);
    for (let x = 1; x < SIZE - 1; x++) {
      const a = (x - 0.5) / SIZE + g.sample((x - 0.5) / SIZE, 0.5)[0];
      const b = (x + 0.5) / SIZE + g.sample((x + 0.5) / SIZE, 0.5)[0];
      expect(b).toBeGreaterThan(a - 1e-6);
    }
  });
});
