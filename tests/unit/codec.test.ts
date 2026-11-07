import { describe, expect, it } from 'vitest';
import { decodeTile, encodeTile } from '../../src/core/history/codec';

function roundTrip(data: Uint8Array, w: number, h: number) {
  expect(decodeTile(encodeTile(data, w, h), w, h)).toEqual(data);
}

describe('tile codec', () => {
  it('round-trips empty, full and random tiles', () => {
    const w = 128;
    const h = 128;
    roundTrip(new Uint8Array(w * h), w, h);
    roundTrip(new Uint8Array(w * h).fill(255), w, h);
    const r = new Uint8Array(w * h);
    let seed = 7;
    for (let i = 0; i < r.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      r[i] = seed >> 16;
    }
    roundTrip(r, w, h);
  });

  it('round-trips tiles with odd sizes', () => {
    const data = new Uint8Array(37 * 5).map((_, i) => (i * 7) % 251);
    roundTrip(data, 37, 5);
  });

  it('shrinks soft masks a lot', () => {
    const w = 128;
    const h = 128;
    const soft = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const d = Math.hypot(x - 64, y - 64) / 64;
        soft[y * w + x] = Math.max(0, 255 * (1 - d * d));
      }
    }
    const packed = encodeTile(soft, w, h);
    expect(packed.length).toBeLessThan((w * h) / 1.5);
    roundTrip(soft, w, h);
    expect(encodeTile(new Uint8Array(w * h), w, h).length).toBeLessThan(300);
  });
});
