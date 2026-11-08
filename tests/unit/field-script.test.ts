import { describe, expect, it, vi } from 'vitest';
import type { GLContext } from '../../src/core/gl/context';
import { createField } from '../../src/tools/liquify/index';
import { DisplacementGrid, strokeTo } from '../../src/tools/liquify/grid';

const SIZE = 128;

/** The grid is pure, and the texture is all the field wants of the GPU. */
function fakeGl() {
  return { createTex: vi.fn(() => ({})), upload: vi.fn(), destroyTex: vi.fn() } as unknown as GLContext & { upload: ReturnType<typeof vi.fn> };
}

describe('displacement from a function', () => {
  it('reads the photo where the function says', () => {
    const g = new DisplacementGrid(SIZE, SIZE);
    expect(g.displace(() => [0.1, -0.05])).toBe(true);
    const [du, dv] = g.sample(0.5, 0.5);
    expect(du).toBeCloseTo(0.1, 5);
    expect(dv).toBeCloseTo(-0.05, 5);
  });

  it('goes on top of what the field holds, as one warp after the other', () => {
    const g = new DisplacementGrid(SIZE, SIZE);
    // Only the left half is moved, and the second warp reads the right half from there.
    g.displace((u) => [u < 0.5 ? 0.1 : 0, 0]);
    g.displace((u) => [u > 0.6 ? -0.3 : 0, 0]);
    expect(g.sample(0.75, 0.5)[0]).toBeCloseTo(-0.2, 5);
    expect(g.sample(0.25, 0.5)[0]).toBeCloseTo(0.1, 5);
  });

  it('leaves alone what is outside the area', () => {
    const g = new DisplacementGrid(SIZE, SIZE);
    g.displace(() => [0.1, 0], { u0: 0.25, v0: 0.25, u1: 0.5, v1: 0.5 });
    expect(g.sample(0.375, 0.375)[0]).toBeCloseTo(0.1, 5);
    expect(g.sample(0.75, 0.75)).toEqual([0, 0]);
  });

  it('changes nothing when the function moves nothing, or gives a bad number', () => {
    const g = new DisplacementGrid(SIZE, SIZE);
    expect(g.displace(() => [0, 0])).toBe(false);
    expect(g.displace(() => [NaN, Infinity])).toBe(false);
    expect(g.takeSnapshot()).toEqual([]);
    expect(g.isEmpty()).toBe(true);
  });

  it('touches only the tiles of the area', () => {
    const g = new DisplacementGrid(SIZE, SIZE);
    g.displace(() => [0.1, 0], { u0: 0, v0: 0, u1: 0.1, v1: 0.1 });
    expect(g.takeSnapshot().length).toBe(1);
  });
});

describe('a stroke from code', () => {
  it('dabs where it starts, except for a push', () => {
    const bloat = new DisplacementGrid(SIZE, SIZE);
    strokeTo(bloat, 'bloat', 20, 1, null, 64, 64);
    expect(bloat.isEmpty()).toBe(false);
    const push = new DisplacementGrid(SIZE, SIZE);
    strokeTo(push, 'push', 20, 1, null, 64, 64);
    expect(push.isEmpty()).toBe(true);
  });
});

describe('the scripted API of the field', () => {
  const path = [
    [0.3, 0.5],
    [0.5, 0.45],
    [0.7, 0.5],
  ] as const;
  const stroke = { mode: 'push', radius: 0.05, strength: 0.8, path };

  it('moves the field exactly as the same stroke of the person', () => {
    const person = createField(fakeGl(), 512, 512);
    person.begin('push', 0.05, 0.8);
    for (const [u, v] of path) person.stroke(u, v);
    person.end();
    const script = createField(fakeGl(), 512, 512);
    script.apply({ strokes: [stroke] }, 'Careta');
    expect(script.isEmpty()).toBe(false);
    expect(script.serialize()).toEqual(person.serialize());
  });

  it('gives one undo step for several strokes, with the label asked for', async () => {
    const f = createField(fakeGl(), 512, 512);
    const second = { ...stroke, path: [[0.5, 0.2], [0.5, 0.8]] as const };
    const entry = f.apply({ strokes: [stroke, second] }, 'Careta')!;
    expect(entry.label).toBe('Careta');
    expect(entry.bytes).toBeGreaterThan(0);
    const after = f.serialize().slice();
    expect(f.isEmpty()).toBe(false);

    await entry.undo();
    expect(f.isEmpty()).toBe(true);
    await entry.redo();
    expect(f.serialize()).toEqual(after);
  });

  it('takes a function as well', async () => {
    const f = createField(fakeGl(), 512, 512);
    const entry = f.apply({ offset: (u) => [u > 0.5 ? 0.02 : 0, 0] }, 'Careta')!;
    expect(f.lookup(0.75, 0.5)[0]).toBeCloseTo(0.02, 5);
    await entry.undo();
    expect(f.isEmpty()).toBe(true);
  });

  it('gives no step when nothing changed', () => {
    const f = createField(fakeGl(), 512, 512);
    expect(f.apply({ strokes: [] }, 'Careta')).toBeNull();
    expect(f.apply({ offset: () => [0, 0] }, 'Careta')).toBeNull();
    // One point of a push has no direction to go.
    expect(f.apply({ strokes: [{ ...stroke, path: [[0.5, 0.5]] }] }, 'Careta')).toBeNull();
  });

  it('sends the change to the texture', () => {
    const gl = fakeGl();
    const f = createField(gl, 512, 512);
    gl.upload.mockClear();
    f.apply({ strokes: [stroke] }, 'Careta');
    expect(gl.upload).toHaveBeenCalled();
  });

  it('does not disturb a later stroke of the person', () => {
    const f = createField(fakeGl(), 512, 512);
    f.apply({ strokes: [stroke] }, 'Careta');
    f.begin('push', 0.05, 0.6);
    f.stroke(0.2, 0.2);
    f.stroke(0.25, 0.2);
    expect(f.end()?.label).toBe('Liquify');
  });

  it('works the same on a second field, which holds its own displacement', () => {
    const gl = fakeGl();
    const liquify = createField(gl, 512, 512);
    const other = createField(gl, 512, 512);
    other.apply({ strokes: [stroke] }, 'Careta');
    expect(other.isEmpty()).toBe(false);
    expect(liquify.isEmpty()).toBe(true);
  });
});
