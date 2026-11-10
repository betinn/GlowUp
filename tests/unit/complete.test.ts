import { describe, expect, it } from 'vitest';
import { completePlates, distanceTo, FILL_TILE, growFill, keptPart, planFill, runFill, settle, shrinkPlate, type Inpaint, type PlateSet } from '../../src/core/face/complete';
import { buildPlate, nearestCells } from '../../src/core/face/plate';

/**
 * A stand-in for the model: every unknown cell takes the color of the known cell nearest to it in the tile.
 * It carries on what is next to the hole, which is all these tests need of a model.
 */
const nearest: Inpaint = async (rgb, known, w, h) => {
  const seed = new Uint8Array(w * h);
  for (let i = 0; i < seed.length; i++) seed[i] = known[i] ? 1 : 0;
  const near = nearestCells(seed, w, h);
  const out = new Uint8Array(rgb);
  for (let i = 0; i < seed.length; i++) {
    if (seed[i] || near[i] < 0) continue;
    for (let c = 0; c < 3; c++) out[c * w * h + i] = rgb[c * w * h + near[i]];
  }
  return out;
};

const never = { tile: () => undefined, stopped: () => false };

describe('the plan of a fill', () => {
  it('measures how far each cell is from a mark', () => {
    const mark = new Uint8Array(100);
    mark[55] = 1;
    const d = distanceTo(mark, 10, 10);
    expect(d[55]).toBe(0);
    expect(d[58]).toBe(3);
    expect(d[25]).toBe(3);
    expect(distanceTo(new Uint8Array(4), 2, 2)[0]).toBe(Infinity);
  });

  it('covers every cell of the hole with the middle of some tile, on a plate larger than a tile', () => {
    const w = 1400;
    const h = 900;
    const hole = new Uint8Array(w * h);
    for (let y = 40; y < 860; y++) for (let x = 30; x < 1370; x++) if ((x + y) % 7 === 0) hole[y * w + x] = 1;
    const { tiles } = planFill(hole, w, h);
    expect(tiles.length).toBeGreaterThan(4);
    const inMiddle = new Uint8Array(w * h);
    for (const tile of tiles) {
      expect(tile.w).toBe(FILL_TILE);
      expect(tile.x).toBeGreaterThanOrEqual(0);
      expect(tile.x + tile.w).toBeLessThanOrEqual(w);
      const kept = keptPart(tile, w, h);
      for (let y = kept.y; y < kept.y + kept.h; y++) inMiddle.fill(1, y * w + kept.x, y * w + kept.x + kept.w);
    }
    for (let i = 0; i < hole.length; i++) if (hole[i]) expect(inMiddle[i]).toBe(1);
  });

  it('asks for no tile where there is no hole, and a small plate is one tile', () => {
    expect(planFill(new Uint8Array(600 * 600), 600, 600).tiles).toHaveLength(0);
    const hole = new Uint8Array(200 * 300);
    hole[150 * 200 + 100] = 1;
    expect(planFill(hole, 200, 300).tiles).toEqual([{ x: 0, y: 0, w: 200, h: 300 }]);
  });
});

describe('running the tiles', () => {
  const w = 900;
  const h = 600;
  const plateWith = (hole: Uint8Array) => {
    const plate = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) plate.set(hole[i] ? [9, 9, 9, 255] : [180, 150, 120, 0], i * 4);
    return plate;
  };
  const band = () => {
    const hole = new Uint8Array(w * h);
    for (let y = 250; y < 330; y++) for (let x = 20; x < 880; x++) hole[y * w + x] = 1;
    return hole;
  };

  it('changes the color of hole cells only, and fills every one of them', async () => {
    const hole = band();
    const plate = plateWith(hole);
    const before = plate.slice();
    expect(await runFill(plate, planFill(hole, w, h), w, h, nearest, never)).toBe(true);
    for (let i = 0; i < w * h; i++) {
      if (hole[i]) {
        expect(plate[i * 4]).toBe(180);
        expect(plate[i * 4 + 3]).toBe(255);
      } else {
        expect(plate[i * 4]).toBe(before[i * 4]);
      }
    }
  });

  it('leaves no line where two tiles meet, even when they disagree', async () => {
    const hole = band();
    const plate = plateWith(hole);
    let call = 0;
    // Each tile answers with its own gray: the worst a model could do at a seam.
    const uneven: Inpaint = async (rgb) => new Uint8Array(rgb.length).fill(100 + 40 * (call++ % 2));
    await runFill(plate, planFill(hole, w, h), w, h, uneven, never);
    let largest = 0;
    for (let x = 21; x < 879; x++) largest = Math.max(largest, Math.abs(plate[(290 * w + x) * 4] - plate[(290 * w + x - 1) * 4]));
    expect(largest).toBeLessThanOrEqual(2);
  });

  it('stops when asked, and then the plate is as it was', async () => {
    const hole = band();
    const plate = plateWith(hole);
    const before = plate.slice();
    let tiles = 0;
    const ok = await runFill(plate, planFill(hole, w, h), w, h, nearest, { tile: () => tiles++, stopped: () => tiles >= 1 });
    expect(ok).toBe(false);
    expect(plate).toEqual(before);
  });
});

describe('where a filled plate meets the photo', () => {
  const W = 48;
  /** A plate whose left half is covered, as RGBA with one gray per cell. */
  const plateOf = (gray: (x: number, y: number) => number) => {
    const out = new Uint8Array(W * W * 4);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) out.set([gray(x, y), gray(x, y), gray(x, y), x < 24 ? 255 : 0], (y * W + x) * 4);
    return out;
  };
  const covered = new Uint8Array(W * W);
  for (let y = 0; y < W; y++) for (let x = 0; x < 24; x++) covered[y * W + x] = 1;

  it('the plate takes the tone of the photo at the line, the cells the model only borrowed get the photo back, and alpha stays', () => {
    // The photo is darker next to the layer, as a soft shadow leaves it. The model was not shown those cells,
    // and put its own lighter tone there and in the hole.
    const before = plateOf((x) => (x < 30 ? 100 : 140));
    const plate = plateOf((x) => (x < 30 ? 140 : 140));
    settle(plate, before, covered, W, W);
    const at = (x: number, y: number) => (y * W + x) * 4;
    // Where the plate ends, it now meets the photo: no step of 40 levels.
    expect(Math.abs(plate[at(23, 20)] - before[at(24, 20)])).toBeLessThan(6);
    // The borrowed cells are the photo again.
    for (const x of [24, 27, 29, 40]) expect(plate[at(x, 20)]).toBe(before[at(x, 20)]);
    expect(plate[at(10, 20) + 3]).toBe(255);
    expect(plate[at(30, 20) + 3]).toBe(0);
  });

  it('a plate that already agrees with the photo is left exactly as it is', () => {
    const before = plateOf(() => 120);
    const plate = plateOf((x) => (x < 24 ? 90 + (x % 5) : 120));
    const same = plate.slice();
    settle(plate, before, covered, W, W);
    expect(plate).toEqual(same);
  });

  it('the detail the model made stays: only the tone moves', () => {
    const before = plateOf((x) => (x < 30 ? 100 : 140));
    const plate = plateOf((x, y) => (x < 24 ? 140 + ((x + y) % 2 ? 6 : -6) : 140));
    settle(plate, before, covered, W, W);
    const at = (x: number, y: number) => (y * W + x) * 4;
    expect(Math.abs(plate[at(20, 20)] - plate[at(21, 20)])).toBeGreaterThan(8);
  });
});

describe('both plates of a photo', () => {
  const S = 240;
  const BACK = [200, 205, 210];
  const NECK = [150, 110, 90];
  const HEAD = [20, 30, 40];
  const inHead = (x: number, y: number) => Math.hypot(x - 120, y - 100) < 60;
  const inNeck = (x: number, y: number) => y >= 100 && x > 90 && x < 150;
  /** A head on a neck in front of a plain wall. */
  const scene = (): PlateSet => {
    const rgba = new Uint8ClampedArray(S * S * 4);
    const personMatte = new Uint8Array(S * S);
    const headMatte = new Uint8Array(S * S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const at = y * S + x;
        const head = inHead(x, y);
        const neck = inNeck(x, y);
        rgba.set([...(head ? HEAD : neck ? NECK : BACK), 255], at * 4);
        if (head || neck) personMatte[at] = 255;
        if (head) headMatte[at] = 255;
      }
    }
    return { w: S, h: S, span: 106, back: buildPlate(rgba, personMatte, S, S), head: buildPlate(rgba, headMatte, S, S), personMatte, headMatte };
  };
  const run = async (set: PlateSet, inpaint: Inpaint = nearest, stopped = () => false) => {
    const out: Partial<Record<'back' | 'head', Uint8Array>> = {};
    let tiles = 0;
    let total = 0;
    const ok = await completePlates(set, inpaint, {
      tile(done, of) {
        tiles = done;
        total = of;
      },
      plate: (which, data) => (out[which] = data),
      stopped,
    });
    return { ok, out, tiles, total };
  };
  const near = (plate: Uint8Array, x: number, y: number, color: number[]) => {
    for (let c = 0; c < 3; c++) expect(Math.abs(plate[(y * S + x) * 4 + c] - color[c]), `channel ${c} at ${x}, ${y}`).toBeLessThan(25);
  };

  it('behind a head, shows neck where the head hid neck and background where it hid background', async () => {
    const { ok, out, tiles, total } = await run(scene());
    expect(ok).toBe(true);
    expect(tiles).toBe(total);
    expect(total).toBeGreaterThan(0);
    const head = out.head!;
    // Just inside the head, above the neck: the neck goes on up under the jaw.
    near(head, 120, 150, NECK);
    // Just inside the head, at its top and at its side: the wall.
    near(head, 120, 48, BACK);
    near(head, 68, 90, BACK);
    // Nothing of the head itself is left in what is behind it.
    for (const [x, y] of [[120, 150], [120, 48], [68, 90], [172, 90]]) expect(head[(y * S + x) * 4]).toBeGreaterThan(100);
    // The side of the neck goes on up from where it is. Right above its edge the plate is about half neck and
    // half wall, and a little further in, all neck: the wall takes no notch out of the side of the neck.
    const neckAt = (x: number, y: number) => (BACK[0] - head[(y * S + x) * 4]) / (BACK[0] - NECK[0]);
    expect(neckAt(95, 150)).toBeGreaterThan(0.4);
    expect(neckAt(145, 150)).toBeGreaterThan(0.4);
    expect(neckAt(84, 145)).toBeLessThan(0.1);
  });

  it('leaves every pixel that no layer covers exactly as the photo has it', async () => {
    const set = scene();
    const { out } = await run(set);
    for (const which of ['back', 'head'] as const) {
      const before = set[which];
      const after = out[which]!;
      for (let i = 0; i < S * S; i++) {
        if (before[i * 4 + 3] !== 0) continue;
        for (let c = 0; c < 4; c++) expect(after[i * 4 + c]).toBe(before[i * 4 + c]);
      }
    }
  });

  it('with nobody in it, the plate is background all the way in from the edge', async () => {
    const { out } = await run(scene());
    near(out.back!, 120, 48, BACK);
    near(out.back!, 96, 200, BACK);
  });

  it('never asks the model for a hole wider than a ring', async () => {
    let deepest = 0;
    const measured: Inpaint = async (rgb, known, w, h) => {
      const seed = new Uint8Array(w * h);
      for (let i = 0; i < seed.length; i++) seed[i] = known[i] ? 1 : 0;
      const d = distanceTo(seed, w, h);
      for (let i = 0; i < seed.length; i++) if (!seed[i] && d[i] > deepest) deepest = d[i];
      return nearest(rgb, known, w, h);
    };
    // A head large enough for more than one ring.
    const set = scene();
    set.span = 400;
    await run(set, measured);
    expect(deepest).toBeGreaterThan(0);
    expect(deepest).toBeLessThanOrEqual(46);
  });

  it('stops when asked and hands over no plate', async () => {
    let calls = 0;
    const { ok, out } = await run(scene(), nearest, () => calls++ > 1);
    expect(ok).toBe(false);
    expect(out.back).toBeUndefined();
    expect(out.head).toBeUndefined();
  });
});

describe('a face too large for a tile', () => {
  it('a smaller plate keeps colors, and one covered cell covers the small one', () => {
    const plate = new Uint8Array(4 * 4 * 4);
    for (let i = 0; i < 16; i++) plate.set([100, 50, 0, 0], i * 4);
    plate[3] = 255;
    const small = shrinkPlate(plate, 4, 4, 2, 2);
    expect(small[0]).toBe(100);
    expect(small[3]).toBe(255);
    expect(small[7]).toBe(0);
  });

  it('comes back at full size with the answer of the small one and the fine texture the plate had', () => {
    const w = 64;
    const h = 64;
    const plate = new Uint8Array(w * h * 4);
    const hole = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const at = y * w + x;
        const covered = x >= 16 && x < 48;
        // A fine checker over a flat guess, as the quick plate leaves it.
        const v = covered ? 100 + ((x + y) % 2 ? 6 : -6) : 30;
        plate.set([v, v, v, covered ? 255 : 0], at * 4);
        if (covered) hole[at] = 1;
      }
    }
    const small = new Uint8Array(32 * 32 * 4).fill(200);
    growFill(plate, hole, w, h, small, 32, 32);
    const a = plate[(30 * w + 30) * 4];
    const b = plate[(30 * w + 31) * 4];
    // Around the answer of the small plate, and still a checker.
    expect((a + b) / 2).toBeGreaterThan(190);
    expect(Math.abs(a - b)).toBeGreaterThan(6);
    // Outside the hole nothing changed, and next to it no edge of the photo leaked in as a line.
    expect(plate[(30 * w + 5) * 4]).toBe(30);
    expect(Math.abs(plate[(30 * w + 16) * 4] - 200)).toBeLessThan(12);
  });
});
