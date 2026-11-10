import { describe, expect, it, vi } from 'vitest';
import { FieldJobs, type FieldFrame, type FieldTask, type TaskResult } from '../../src/core/face/fieldjobs';
import { bandsOf, fieldFrom, fillField, fillRough, fillRows, gridArea, joinBands, type ShapeSource } from '../../src/core/face/fieldwork';
import { makeFace, type Face } from '../../src/core/face/scan';
import type { GLContext } from '../../src/core/gl/context';
import { createField } from '../../src/tools/liquify/index';
import { lens, oval } from './face-fixtures';

/** A face looking at the camera, in the middle of a square photo, as in the tests of the sliders. */
const FRONT: Face = makeFace(oval(0.5, 0.5, 0.22, 0.3), {
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

const SIDE = 256;
const source = (values: Record<string, number>, amount?: number): ShapeSource => ({ amount, shapes: [{ at: [0.5, 0.5], values }], off: [], faces: [FRONT], w: 1000, h: 1000 });

/** Every kind of field: plain, with the share of the lips, with the share of a head alone, and with the automatic mode. */
const CASES: [string, ShapeSource][] = [
  ['jawline', source({ jawline: -70 })],
  ['lips', source({ lips: 80, smile: 40 })],
  ['head', source({ head: 90, chin: -50 })],
  ['auto and sliders', source({ eyeSize: 60 }, 50)],
];

const same = (a: Float32Array | null, b: Float32Array | null) => {
  expect(!!a).toBe(!!b);
  if (a && b) expect(Buffer.from(a.buffer, a.byteOffset, a.byteLength).equals(Buffer.from(b.buffer, b.byteOffset, b.byteLength))).toBe(true);
};

describe('the field in bands', () => {
  it('comes out the same, bit for bit, however its rows are cut', () => {
    for (const [name, s] of CASES) {
      const field = fieldFrom(s)!;
      const whole = fillField(field, SIDE, SIDE);
      expect(whole.whole.some((v) => v !== 0), name).toBe(true);
      for (const count of [1, 3, 7, 16]) {
        // A worker builds its own field from the same source, and the bands come back in any order.
        const bands = bandsOf(whole.area, count).map(([y0, y1]) => fillRows(fieldFrom(s)!, gridArea(fieldFrom(s)!, SIDE, SIDE), SIDE, SIDE, y0, y1)).reverse();
        const joined = joinBands(whole.area, bands);
        expect(joined.area).toEqual(whole.area);
        same(joined.whole, whole.whole);
        same(joined.over, whole.over);
        same(joined.alone, whole.alone);
      }
    }
  });

  it('cuts every row of the area once', () => {
    const area = { x0: 3, y0: 10, x1: 50, y1: 47 };
    for (const count of [1, 4, 5, 37, 80]) {
      const bands = bandsOf(area, count);
      expect(bands[0][0]).toBe(10);
      expect(bands[bands.length - 1][1]).toBe(47);
      for (let i = 1; i < bands.length; i++) expect(bands[i][0]).toBe(bands[i - 1][1]);
    }
    expect(bandsOf({ x0: 0, y0: 5, x1: 9, y1: 5 }, 4)).toEqual([]);
  });

  it('roughly, lands close to the finished field, on the grid of a photo', () => {
    const side = 1024;
    for (const [name, s] of CASES) {
      const field = fieldFrom(s)!;
      const done = fillField(field, side, side);
      const rough = fillRough(field, side, side, 4);
      expect(rough.area).toEqual(done.area);
      let largest = 0;
      let off = 0;
      for (let i = 0; i < done.whole.length; i++) {
        largest = Math.max(largest, Math.abs(done.whole[i]));
        off = Math.max(off, Math.abs(done.whole[i] - rough.whole[i]));
      }
      expect(off, name).toBeLessThan(largest * 0.25);
      expect(!!rough.over).toBe(!!done.over);
      expect(!!rough.alone).toBe(!!done.alone);
    }
  }, 60_000);
});

describe('the field of a slider worked out elsewhere', () => {
  const fakeGl = () =>
    ({
      createTex: () => ({ w: 1, h: 1, tex: {}, fbo: null, format: 'rg16f', levels: 1 }),
      destroyTex: vi.fn(),
      upload: vi.fn(),
    }) as unknown as GLContext;

  it('is the field the page works out by itself, after any rough ones', () => {
    for (const [name, s] of CASES) {
      const here = createField(fakeGl(), 1000, 1000);
      here.setShape(source({ temples: 40 }));
      here.setShape(s);
      const there = createField(fakeGl(), 1000, 1000);
      const { w, h } = there.gridSize;
      there.setShapeGrids(fillField(fieldFrom(source({ temples: 40 }))!, w, h));
      // With the same shares, rough fields only go to the GPU: the grids keep the last finished field.
      const kept = there.shapeData()!.slice();
      there.showRoughGrids(fillRough(fieldFrom(source({ jawline: 100 }))!, w, h, 4));
      same(there.shapeData(), kept);
      there.showRoughGrids(fillRough(fieldFrom(s)!, w, h, 4));
      there.setShapeGrids(fillField(fieldFrom(s)!, w, h));
      same(there.shapeData(), here.shapeData());
      expect(there.lookup(0.4, 0.62), name).toEqual(here.lookup(0.4, 0.62));
      expect(there.maxDisplacement()).toBe(here.maxDisplacement());
    }
  }, 60_000);

  it('with a stroke of the brush, a rough field takes the place of the shape until the finished one', () => {
    const here = createField(fakeGl(), 1000, 1000);
    const there = createField(fakeGl(), 1000, 1000);
    const stroke = { strokes: [{ mode: 'push', radius: 0.05, strength: 0.8, path: [[0.3, 0.5], [0.4, 0.5]] as [number, number][] }] };
    here.apply(stroke, 'Liquify');
    there.apply(stroke, 'Liquify');
    const s = source({ jawline: 60 });
    here.setShape(s);
    const { w, h } = there.gridSize;
    there.showRoughGrids(fillRough(fieldFrom(s)!, w, h, 4));
    there.setShapeGrids(fillField(fieldFrom(s)!, w, h));
    same(there.shapeData(), here.shapeData());
    expect(there.lookup(0.35, 0.5)).toEqual(here.lookup(0.35, 0.5));
    expect(there.serialize()).toEqual(here.serialize());
  }, 60_000);
});

/** Tasks that end when the test says so. Each one works out its real numbers. */
function manualRunner() {
  const running: { slot: number; job: number; source: ShapeSource; task: FieldTask; end(): void; fail(): void }[] = [];
  const run = (slot: number, job: number, s: ShapeSource, task: FieldTask) =>
    new Promise<TaskResult>((resolve, reject) => {
      const end = () => {
        const field = fieldFrom(s);
        if (!field) return resolve({ area: null, band: null });
        const area = gridArea(field, SIDE, SIDE);
        if (task.kind === 'rough') {
          const g = fillRough(field, SIDE, SIDE, task.step);
          resolve({ area, band: { y0: area.y0, y1: area.y1, whole: g.whole, over: g.over, alone: g.alone } });
        } else {
          resolve({ area, band: fillRows(field, area, SIDE, SIDE, task.y0, task.y1) });
        }
      };
      running.push({ slot, job, source: s, task, end, fail: () => reject(new Error('worker')) });
    });
  /** Ends the oldest running task, and lets the promises settle. */
  const next = async (index = 0) => {
    const [t] = running.splice(index, 1);
    t.end();
    await new Promise((r) => setTimeout(r, 0));
    return t;
  };
  const drain = async () => {
    while (running.length) await next();
  };
  return { run, running, next, drain };
}

function jobs(slots = 2) {
  const runner = manualRunner();
  const frames: FieldFrame[] = [];
  const busy: boolean[] = [];
  const failed = vi.fn();
  const j = new FieldJobs({ slots, bands: 4, step: 4, run: runner.run, show: (f) => frames.push(f), busy: (b) => busy.push(b), failed });
  return { j, runner, frames, busy, failed };
}

describe('the jobs of a slider', () => {
  it('show a rough field first, then the finished one, which is the field of the page', async () => {
    const { j, runner, frames, busy } = jobs();
    const s = source({ jawline: 50 });
    j.request(s);
    expect(j.busy).toBe(true);
    await runner.drain();
    expect(frames.map((f) => f.rough)).toEqual([true, false]);
    expect(j.busy).toBe(false);
    expect(busy).toEqual([true, false]);
    const done = fillField(fieldFrom(s)!, SIDE, SIDE);
    same(frames[1].grids!.whole, done.whole);
  });

  it('coalesce to the latest value: the values asked while the workers are busy are never worked', async () => {
    const { j, runner, frames } = jobs(1);
    j.request(source({ jawline: 10 }));
    // The only worker is on the first value. Many more come before it is free.
    for (let v = 11; v <= 40; v++) j.request(source({ jawline: v }));
    expect(j.started).toBe(1);
    await runner.drain();
    const worked = new Set(frames.map((f) => f.job));
    expect(worked.size).toBe(2);
    // One rough task for the first value, and for the last one a rough task and its bands. Nothing in between.
    expect(j.started).toBe(1 + 1 + 4);
    const last = frames[frames.length - 1];
    expect(last.rough).toBe(false);
    same(last.grids!.whole, fillField(fieldFrom(source({ jawline: 40 }))!, SIDE, SIDE).whole);
  });

  it('drop the bands of a value made stale, and never show what they worked out', async () => {
    const { j, runner, frames } = jobs(2);
    j.request(source({ jawline: 30 }));
    await runner.next();
    // The rough field of 30 is shown, and two of its four bands are running.
    expect(runner.running.filter((t) => t.task.kind === 'band')).toHaveLength(2);
    j.request(source({ jawline: -30 }));
    const startedBefore = j.started;
    await runner.drain();
    // The two bands of 30 that had not started never did; the two running ended, and were dropped.
    expect(j.started - startedBefore).toBe(1 + 4);
    const shownOf30 = frames.filter((f) => f.job === 1);
    expect(shownOf30.map((f) => f.rough)).toEqual([true]);
    expect(frames[frames.length - 1].rough).toBe(false);
    same(frames[frames.length - 1].grids!.whole, fillField(fieldFrom(source({ jawline: -30 }))!, SIDE, SIDE).whole);
  });

  it('only move forward: a late rough field of an older value is not shown over a newer one', async () => {
    const { j, runner, frames } = jobs(2);
    j.request(source({ jawline: 20 }));
    j.request(source({ jawline: 25 }));
    // Both rough tasks run, one on each worker. The newer one ends first.
    expect(runner.running.map((t) => t.job)).toEqual([1, 2]);
    await runner.next(1);
    await runner.next(0);
    expect(frames.map((f) => f.job)).toEqual([2]);
    await runner.drain();
    expect(frames.every((f) => f.job === 2)).toBe(true);
  });

  it('are dropped all at once when the field is set some other way', async () => {
    const { j, runner, frames, busy } = jobs(2);
    j.request(source({ chin: 40 }));
    await runner.next();
    j.cancel();
    expect(j.busy).toBe(false);
    expect(busy).toEqual([true, false]);
    const count = frames.length;
    await runner.drain();
    expect(frames).toHaveLength(count);
    await expect(j.idle()).resolves.toBeUndefined();
  });

  it('say when the latest is done, and hand it back to the page when a worker fails', async () => {
    const { j, runner, failed } = jobs(1);
    const s = source({ head: 50 });
    j.request(s);
    let done = false;
    void j.idle().then(() => (done = true));
    runner.running[0].fail();
    runner.running.splice(0, 1);
    await new Promise((r) => setTimeout(r, 0));
    expect(done).toBe(true);
    expect(failed).toHaveBeenCalledWith(s, expect.any(Error));
  });

  it('finish at once when the field moves nothing', async () => {
    const { j, runner, frames } = jobs(1);
    j.request(source({}));
    await runner.drain();
    expect(frames.map((f) => f.rough)).toEqual([false]);
    expect(j.started).toBe(1);
    expect(j.busy).toBe(false);
  });
});
