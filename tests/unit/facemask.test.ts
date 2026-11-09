import { describe, expect, it } from 'vitest';
import { boxBlur, buildFaceMask, fadeAlong, fillPolygon, guidedFilter, softBlur, type Point } from '../../src/core/face/mask';
import { featherLod } from '../../src/core/pipeline/pipeline';
import { createDoc } from '../../src/core/doc';
import { applyPresetToDoc, LOOKS } from '../../src/presets/recipes';

const sum = (a: ArrayLike<number>) => Array.from(a).reduce((n, v) => n + v, 0);

/** An oval that starts at the top and goes clockwise, like the outline of a face. */
function oval(cx: number, cy: number, rx: number, ry: number, n = 36): Point[] {
  return Array.from({ length: n }, (_, i): Point => {
    const a = (i / n) * Math.PI * 2;
    return [cx + Math.sin(a) * rx, cy - Math.cos(a) * ry];
  });
}

const CHIN = 18;

describe('fillPolygon', () => {
  it('covers a square exactly, with fractions on the edges', () => {
    const out = fillPolygon(
      [
        [2.5, 2],
        [6.5, 2],
        [6.5, 6],
        [2.5, 6],
      ],
      10,
      10,
    );
    expect(sum(out)).toBeCloseTo(16, 3);
    expect(out[3 * 10 + 4]).toBeCloseTo(1, 3);
    expect(out[3 * 10 + 2]).toBeCloseTo(0.5, 3);
    expect(out[0]).toBe(0);
  });

  it('clips what falls outside the grid', () => {
    const out = fillPolygon(
      [
        [-5, -5],
        [5, -5],
        [5, 5],
        [-5, 5],
      ],
      10,
      10,
    );
    expect(sum(out)).toBeCloseTo(25, 3);
  });
});

describe('blur', () => {
  it('keeps the total of a mask away from the border', () => {
    const src = new Float32Array(64 * 64);
    src[32 * 64 + 32] = 1;
    expect(sum(boxBlur(src, 64, 64, 3))).toBeCloseTo(1, 4);
    expect(sum(softBlur(src, 64, 64, 4))).toBeCloseTo(1, 4);
  });

  it('turns a hard edge into a ramp', () => {
    const src = new Float32Array(64 * 8);
    for (let y = 0; y < 8; y++) src.fill(1, y * 64 + 32, y * 64 + 64);
    const out = softBlur(src, 64, 8, 4);
    const row = Array.from(out.subarray(4 * 64, 5 * 64));
    for (let x = 1; x < 64; x++) expect(row[x]).toBeGreaterThanOrEqual(row[x - 1] - 1e-5);
    expect(row[32]).toBeGreaterThan(0.3);
    expect(row[32]).toBeLessThan(0.7);
  });
});

describe('guidedFilter', () => {
  const W = 80;
  const H = 20;
  /** A soft mask whose ramp is centered on the edge of a two-tone photo. */
  function scene() {
    const guide = new Float32Array(W * H);
    const mask = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        guide[y * W + x] = x < 40 ? 0.2 : 0.8;
        mask[y * W + x] = Math.min(1, Math.max(0, (46 - x) / 12));
      }
    }
    return { guide, mask };
  }

  it('moves a soft edge onto the edge of the photo', () => {
    const { guide, mask } = scene();
    const out = guidedFilter(guide, mask, W, H, 8, 0.0015);
    const row = 10 * W;
    const jump = (a: Float32Array) => a[row + 42] - a[row + 37];
    expect(Math.abs(jump(out))).toBeGreaterThan(Math.abs(jump(mask)) * 1.5);
  });

  it('leaves a mask alone where the photo is flat', () => {
    const { mask } = scene();
    const out = guidedFilter(new Float32Array(W * H).fill(0.5), mask, W, H, 2, 0.0015);
    for (let x = 4; x < W - 4; x++) expect(Math.abs(out[10 * W + x] - mask[10 * W + x])).toBeLessThan(0.1);
  });

  it('stays between 0 and 1', () => {
    const { guide, mask } = scene();
    for (const v of guidedFilter(guide, mask, W, H, 8, 0.0001)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('fadeAlong', () => {
  it('fades only in the given direction, and gets weaker with distance', () => {
    const w = 20;
    const h = 60;
    const src = new Float32Array(w * h);
    for (let y = 10; y < 20; y++) src.fill(1, y * w, (y + 1) * w);
    const out = fadeAlong(src, w, h, 0, 1, 30);
    expect(out[5 * w + 10]).toBe(0);
    expect(out[15 * w + 10]).toBe(1);
    expect(out[25 * w + 10]).toBeGreaterThan(out[40 * w + 10]);
    expect(out[40 * w + 10]).toBeGreaterThan(0);
    expect(out[55 * w + 10]).toBe(0);
  });
});

describe('buildFaceMask', () => {
  const target = { w: 400, h: 400 };
  const at = (m: Uint8Array, x: number, y: number) => m[y * target.w + x];

  it('fills the face and keeps the rest of the photo out', () => {
    const m = buildFaceMask(oval(0.5, 0.4, 0.1, 0.14), CHIN, target);
    expect(m.length).toBe(400 * 400);
    expect(at(m, 200, 160)).toBeGreaterThan(245);
    expect(at(m, 200, 40)).toBe(0);
    expect(at(m, 20, 160)).toBe(0);
    expect(at(m, 380, 380)).toBe(0);
  });

  it('has a soft edge', () => {
    const m = buildFaceMask(oval(0.5, 0.4, 0.1, 0.14), CHIN, target);
    const levels = new Set<number>();
    for (let x = 220; x < 280; x++) levels.add(at(m, x, 160));
    expect(levels.size).toBeGreaterThan(8);
  });

  it('fades down the neck more than to the sides', () => {
    const m = buildFaceMask(oval(0.5, 0.4, 0.1, 0.14), CHIN, target);
    const gap = 16;
    const below = at(m, 200, Math.round(0.54 * 400) + gap);
    const side = at(m, Math.round(0.6 * 400) + gap, 160);
    expect(below).toBeGreaterThan(side + 40);
  });

  it('follows a tilted face', () => {
    // Rotated a quarter turn: the chin points to the right.
    const tilted = oval(0.4, 0.5, 0.14, 0.1).map(([x, y]): Point => [x, y]);
    const start = tilted.findIndex(([x]) => x === Math.min(...tilted.map((p) => p[0])));
    const outline = [...tilted.slice(start), ...tilted.slice(0, start)];
    const m = buildFaceMask(outline, CHIN, target);
    const right = at(m, Math.round(0.54 * 400) + 16, 200);
    const left = at(m, Math.round(0.26 * 400) - 16, 200);
    expect(right).toBeGreaterThan(left + 40);
  });

  it('survives a face cut by the edge of the photo', () => {
    const m = buildFaceMask(oval(0.02, 0.98, 0.1, 0.14), CHIN, target);
    expect(at(m, 8, 392)).toBeGreaterThan(200);
  });

  it('handles a face of a few pixels', () => {
    const m = buildFaceMask(oval(0.5, 0.5, 0.004, 0.005), CHIN, target);
    expect(sum(m)).toBeGreaterThan(0);
  });

  it('asks for the photo only inside the mask grid', () => {
    let seen = { x: 0, y: 0, w: 0, h: 0 };
    buildFaceMask(oval(0.95, 0.5, 0.1, 0.14), CHIN, {
      ...target,
      luma(area) {
        seen = area;
        return new Float32Array(area.w * area.h).fill(0.5);
      },
    });
    expect(seen.x).toBeGreaterThanOrEqual(0);
    expect(seen.x + seen.w).toBeLessThanOrEqual(400);
    expect(seen.y + seen.h).toBeLessThanOrEqual(400);
    expect(seen.w).toBeGreaterThan(40);
  });
});

describe('featherLod', () => {
  it('adds nothing without softness', () => {
    expect(featherLod(0, 0.2, 2048)).toBe(0);
    expect(featherLod(50, 0, 2048)).toBe(0);
  });

  it('scales with the size of the area, so a small face keeps its shape', () => {
    expect(featherLod(50, 0.4, 2048)).toBeCloseTo(featherLod(50, 0.2, 2048) + 1, 5);
    expect(featherLod(100, 0.03, 2048)).toBeLessThan(featherLod(100, 0.3, 2048));
  });
});

describe('recipes and the filter area', () => {
  it('a recipe changes the filter and keeps the chosen area', () => {
    const doc = createDoc(100, 100);
    doc.filter = { id: 'prata', intensity: 1, masked: true, feather: 30, reach: 0.2 };
    applyPresetToDoc(doc, LOOKS[0]);
    expect(doc.filter.id).toBe(LOOKS[0].filter.id);
    expect(doc.filter.masked).toBe(true);
    expect(doc.filter.reach).toBe(0.2);
  });
});
