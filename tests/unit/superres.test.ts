import { describe, expect, it } from 'vitest';
import { axis, MODEL_SCALE, OVERLAP, PAD, planUpscale, runUpscale, tileCount, weightAt, type Upscale } from '../../src/core/superres/tiles';
import { CAP_PIXELS, CAP_SIDE, capNote, PHONE_CAP_PIXELS, pickScale, scalesFor } from '../../src/core/superres/size';

/** A photo with a value that changes from pixel to pixel, so a misplaced tile shows. */
function photo(w: number, h: number): Uint8Array {
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const at = (y * w + x) * 4;
      rgba[at] = (x * 7 + y * 3) % 256;
      rgba[at + 1] = (x * 11 + y * 13) % 256;
      rgba[at + 2] = (x ^ y) % 256;
      rgba[at + 3] = 255;
    }
  }
  return rgba;
}

/** The model as a plain copy of each pixel into a block of 4 by 4. */
const nearest: Upscale = async (rgb, w, h) => {
  const W = w * MODEL_SCALE;
  const H = h * MODEL_SCALE;
  const out = new Uint8Array(W * H * 3);
  for (let c = 0; c < 3; c++) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) out[c * W * H + y * W + x] = rgb[c * w * h + ((y / MODEL_SCALE) | 0) * w + ((x / MODEL_SCALE) | 0)];
    }
  }
  return out;
};

/** What a whole-photo nearest upscale gives at `scale`. */
function expected(rgba: Uint8Array, w: number, h: number, scale: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * scale * h * scale * 4);
  for (let y = 0; y < h * scale; y++) {
    for (let x = 0; x < w * scale; x++) {
      const from = (((y / scale) | 0) * w + ((x / scale) | 0)) * 4;
      const to = (y * w * scale + x) * 4;
      out.set([rgba[from], rgba[from + 1], rgba[from + 2], 255], to);
    }
  }
  return out;
}

/** Pixels that differ, in RGB. */
function differing(a: ArrayLike<number>, b: ArrayLike<number>, keep: (pixel: number) => boolean = () => true): number {
  let count = 0;
  for (let p = 0; p * 4 < a.length; p++) {
    if (!keep(p)) continue;
    if (a[p * 4] !== b[p * 4] || a[p * 4 + 1] !== b[p * 4 + 1] || a[p * 4 + 2] !== b[p * 4 + 2] || a[p * 4 + 3] !== b[p * 4 + 3]) count++;
  }
  return count;
}

const run = (rgba: Uint8Array, w: number, h: number, scale: number, tile: number, model: Upscale, stopAfter = Infinity) => {
  let done = 0;
  return runUpscale(rgba, planUpscale(w, h, scale, tile), model, {
    tile: () => done++,
    stopped: () => done >= stopAfter,
  });
};

describe('tiles of the upscale', () => {
  it('cover each side with neighbors that overlap by at least the overlap', () => {
    for (const [length, tile] of [
      [64, 128],
      [129, 128],
      [500, 128],
      [1351, 256],
      [97, 64],
    ]) {
      const a = axis(length, tile);
      expect(a.starts[0]).toBe(0);
      expect(a.starts.at(-1)! + a.size).toBe(length);
      for (let i = 1; i < a.starts.length; i++) expect(a.starts[i - 1] + a.size - a.starts[i]).toBeGreaterThanOrEqual(OVERLAP);
    }
  });

  it('weigh every pixel in full: the weights of all tiles add up to 1', () => {
    for (const [length, tile] of [
      [500, 128],
      [97, 64],
      [1351, 256],
    ]) {
      const a = axis(length, tile);
      for (let x = 0.125; x < length; x += 0.25) {
        let sum = 0;
        for (let i = 0; i < a.starts.length; i++) {
          if (x >= a.starts[i] && x < a.starts[i] + a.size) sum += weightAt(a, i, x);
        }
        expect(sum).toBeCloseTo(1, 6);
      }
    }
  });

  it('give no weight to the pixels a tile shares with a neighbor next to its side', () => {
    const a = axis(500, 128);
    for (let i = 1; i < a.starts.length; i++) {
      for (let d = 0; d < PAD; d += 0.25) expect(weightAt(a, i, a.starts[i] + d)).toBe(0);
      for (let d = 0; d < PAD; d += 0.25) expect(weightAt(a, i - 1, a.starts[i - 1] + a.size - d - 0.01)).toBe(0);
    }
  });

  it('put a photo together exactly as a whole-photo upscale, at 4 and at 2 times', async () => {
    const w = 150;
    const h = 97;
    const rgba = photo(w, h);
    for (const scale of [4, 2]) {
      const out = await run(rgba, w, h, scale, 64, nearest);
      expect(out).not.toBeNull();
      expect(out!.length).toBe(w * scale * h * scale * 4);
      expect(differing(out!, expected(rgba, w, h, scale))).toBe(0);
    }
  });

  it('leave no seam where a tile is wrong next to a side it shares', async () => {
    // A model that sees zeros past the side of a tile gets the first pixels wrong there. Those never count.
    const w = 150;
    const h = 120;
    const rgba = photo(w, h);
    const plan = planUpscale(w, h, 4, 64);
    const wrongEdges: Upscale = async (rgb, tw, th) => {
      const out = await nearest(rgb, tw, th);
      const W = tw * MODEL_SCALE;
      const H = th * MODEL_SCALE;
      const band = (PAD - 1) * MODEL_SCALE;
      for (let c = 0; c < 3; c++) {
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) if (x < band || y < band || x >= W - band || y >= H - band) out[c * W * H + y * W + x] = 0;
        }
      }
      return out;
    };
    expect(tileCount(plan)).toBeGreaterThan(4);
    const out = await runUpscale(rgba, plan, wrongEdges, { tile() {}, stopped: () => false });
    const want = expected(rgba, w, h, 4);
    const W = w * 4;
    const band = (PAD - 1) * 4;
    // Only the true sides of the photo keep the wrong pixels, as a whole-photo run would at its own sides.
    const inside = (p: number) => {
      const x = p % W;
      const y = (p - x) / W;
      return x >= band && y >= band && x < W - band && y < h * 4 - band;
    };
    expect(differing(out!, want, inside)).toBe(0);
    // And the test means something: at the sides of the photo the wrong pixels are there.
    expect(differing(out!, want)).toBeGreaterThan(0);
  });

  it('hand over smoothly between tiles that disagree', async () => {
    // Each tile comes out a little brighter or darker, as a real model does on its own crop.
    let n = 0;
    const moody: Upscale = async (rgb, tw, th) => {
      const shift = n++ % 2 ? 24 : -24;
      const out = await nearest(new Uint8Array(rgb.length).fill(128), tw, th);
      return out.map((v) => v + shift);
    };
    const w = 200;
    const h = 64;
    const out = (await run(photo(w, h), w, h, 4, 64, moody))!;
    const W = w * 4;
    let jump = 0;
    for (let x = 1; x < W; x++) jump = Math.max(jump, Math.abs(out[(100 * W + x) * 4] - out[(100 * W + x - 1) * 4]));
    // 48 levels apart, over a handover of 64 output pixels: never more than a few levels from one pixel to the next.
    expect(jump).toBeLessThanOrEqual(3);
  });

  it('stop between tiles when asked, and give nothing', async () => {
    let calls = 0;
    const counting: Upscale = (rgb, w, h) => {
      calls++;
      return nearest(rgb, w, h);
    };
    const out = await run(photo(200, 200), 200, 200, 4, 64, counting, 2);
    expect(out).toBeNull();
    expect(calls).toBe(2);
  });

  it('refuse a tile too small to hide its seams', () => {
    expect(() => axis(500, OVERLAP)).toThrow();
  });
});

describe('cap of the upscale', () => {
  it('offers 4 times only while the result fits the cap', () => {
    expect(scalesFor(800, 993, CAP_PIXELS)).toEqual([2, 4]);
    expect(pickScale(800, 993, CAP_PIXELS)).toBe(4);
    // A 12 MP photo: even 2 times would be 48 MP.
    expect(scalesFor(4000, 3000, CAP_PIXELS)).toEqual([]);
    expect(pickScale(4000, 3000, CAP_PIXELS)).toBeNull();
    // 1.5 MP: 4 times would be 24 MP, 2 times is 6 MP.
    expect(scalesFor(1500, 1000, CAP_PIXELS)).toEqual([2]);
  });

  it('is lower on a phone', () => {
    expect(PHONE_CAP_PIXELS).toBeLessThan(CAP_PIXELS);
    expect(scalesFor(800, 993, PHONE_CAP_PIXELS)).toEqual([2]);
  });

  it('keeps the long side within what any device opens', () => {
    // Few pixels, but too long a side: 2 times would be 10000 pixels long.
    expect(scalesFor(5000, 200, CAP_PIXELS)).toEqual([]);
    expect(scalesFor(3000, 200, CAP_PIXELS)).toEqual([2]);
    expect(3000 * 4).toBeGreaterThan(CAP_SIDE);
  });

  it('says why in plain words, and nothing when every scale fits', () => {
    expect(capNote(800, 993, CAP_PIXELS)).toBe('');
    expect(capNote(1500, 1000, CAP_PIXELS)).toContain('Só 2×');
    expect(capNote(4000, 3000, CAP_PIXELS)).toContain('20 MP');
  });
});
