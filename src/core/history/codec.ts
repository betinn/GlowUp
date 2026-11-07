/**
 * Compact lossless codec for 8-bit mask tiles.
 * Each row is delta coded against the previous row, then run-length coded.
 * Soft masks are smooth, so deltas are mostly zero and tiles shrink a lot.
 *
 * Stream format: a control byte `n`. If n < 128, `n + 1` literal bytes follow.
 * If n >= 128, the next byte repeats `n - 125` times (3 to 130).
 */

export function encodeTile(src: Uint8Array, w: number, h: number): Uint8Array {
  const n = w * h;
  const delta = new Uint8Array(n);
  delta.set(src.subarray(0, w));
  for (let i = w; i < n; i++) delta[i] = (src[i] - src[i - w]) & 255;

  const out = new Uint8Array(n + Math.ceil(n / 128) + 8);
  let o = 0;
  let i = 0;
  let litStart = 0;
  const flush = (end: number) => {
    let s = litStart;
    while (s < end) {
      const len = Math.min(128, end - s);
      out[o++] = len - 1;
      out.set(delta.subarray(s, s + len), o);
      o += len;
      s += len;
    }
  };
  while (i < n) {
    let run = 1;
    while (i + run < n && run < 130 && delta[i + run] === delta[i]) run++;
    if (run >= 3) {
      flush(i);
      out[o++] = run + 125;
      out[o++] = delta[i];
      i += run;
      litStart = i;
    } else {
      i += run;
    }
  }
  flush(n);
  return out.slice(0, o);
}

export function decodeTile(data: Uint8Array, w: number, h: number): Uint8Array {
  const n = w * h;
  const out = new Uint8Array(n);
  let o = 0;
  let i = 0;
  while (i < data.length && o < n) {
    const c = data[i++];
    if (c < 128) {
      const len = c + 1;
      out.set(data.subarray(i, i + len), o);
      i += len;
      o += len;
    } else {
      const len = c - 125;
      out.fill(data[i++], o, o + len);
      o += len;
    }
  }
  for (let k = w; k < n; k++) out[k] = (out[k] + out[k - w]) & 255;
  return out;
}
