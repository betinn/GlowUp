/**
 * Plain images for the replication script: `{ w, h, rgb }`, with `rgb` a Float32Array of 0..1 values, three
 * per pixel. Decoding goes through Chromium, so a photo reads here exactly as it reads in the app, with the
 * same formats, the same rotation from its metadata and the same color conversion.
 */

import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

/** Bigger photos are scaled down when read. Grain is measured on what remains, so it is enough for a filter. */
const MAX_SIDE = 2400;

export const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

export function lumaOf(img) {
  const out = new Float32Array(img.w * img.h);
  for (let i = 0; i < out.length; i++) out[i] = luma(img.rgb[i * 3], img.rgb[i * 3 + 1], img.rgb[i * 3 + 2]);
  return out;
}

function pageDecode([b64, maxSide]) {
  return (async () => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.codePointAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes]));
    const k = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * k);
    const h = Math.round(bitmap.height * k);
    const canvas = new OffscreenCanvas(w, h);
    const g = canvas.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingQuality = 'high';
    g.drawImage(bitmap, 0, 0, w, h);
    const { data } = g.getImageData(0, 0, w, h);
    let text = '';
    for (let i = 0; i < data.length; i += 32768) text += String.fromCodePoint(...data.subarray(i, i + 32768));
    return { w, h, data: btoa(text) };
  })();
}

function fromRgba({ w, h, data }) {
  const bytes = Buffer.from(data, 'base64');
  const rgb = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    rgb[i * 3] = bytes[i * 4] / 255;
    rgb[i * 3 + 1] = bytes[i * 4 + 1] / 255;
    rgb[i * 3 + 2] = bytes[i * 4 + 2] / 255;
  }
  return { w, h, rgb };
}

function toRgbaBase64(img) {
  const bytes = Buffer.alloc(img.w * img.h * 4);
  for (let i = 0; i < img.w * img.h; i++) {
    for (let k = 0; k < 3; k++) bytes[i * 4 + k] = Math.round(Math.min(1, Math.max(0, img.rgb[i * 3 + k])) * 255);
    bytes[i * 4 + 3] = 255;
  }
  return bytes.toString('base64');
}

/** A browser with no network and no site, only for reading and encoding images on this machine. */
export async function openDecoder() {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ offline: true })).newPage();
  return {
    read: async (path) => fromRgba(await page.evaluate(pageDecode, [readFileSync(path).toString('base64'), MAX_SIDE])),
    /** The image as it comes back from a JPEG of this quality. Used to make test pairs lifelike. */
    jpeg: async (img, quality) => {
      const file = await page.evaluate(
        async ([b64, w, h, q]) => {
          const bytes = Uint8ClampedArray.from(atob(b64), (c) => c.codePointAt(0));
          const canvas = new OffscreenCanvas(w, h);
          canvas.getContext('2d').putImageData(new ImageData(bytes, w, h), 0, 0);
          const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: q });
          const raw = new Uint8Array(await blob.arrayBuffer());
          let text = '';
          for (let i = 0; i < raw.length; i += 32768) text += String.fromCodePoint(...raw.subarray(i, i + 32768));
          return btoa(text);
        },
        [toRgbaBase64(img), img.w, img.h, quality],
      );
      return fromRgba(await page.evaluate(pageDecode, [file, Math.max(img.w, img.h)]));
    },
    close: () => browser.close(),
  };
}

/** Bilinear lookup in one image. Returns false outside it. */
export function sampleInto(img, x, y, out) {
  if (x < 0 || y < 0 || x > img.w - 1 || y > img.h - 1) return false;
  const ix = Math.min(Math.floor(x), img.w - 2);
  const iy = Math.min(Math.floor(y), img.h - 2);
  const fx = x - ix;
  const fy = y - iy;
  const p = (iy * img.w + ix) * 3;
  const q = p + img.w * 3;
  for (let k = 0; k < 3; k++) {
    const top = img.rgb[p + k] * (1 - fx) + img.rgb[p + 3 + k] * fx;
    const bottom = img.rgb[q + k] * (1 - fx) + img.rgb[q + 3 + k] * fx;
    out[k] = top * (1 - fy) + bottom * fy;
  }
  return true;
}

/** Same image on a smaller grid, by averaging. */
export function shrink(img, w, h) {
  const rgb = new Float32Array(w * h * 3);
  const count = new Float32Array(w * h);
  for (let y = 0; y < img.h; y++) {
    const ty = Math.min(h - 1, Math.floor((y * h) / img.h));
    for (let x = 0; x < img.w; x++) {
      const tx = Math.min(w - 1, Math.floor((x * w) / img.w));
      const t = ty * w + tx;
      const s = (y * img.w + x) * 3;
      rgb[t * 3] += img.rgb[s];
      rgb[t * 3 + 1] += img.rgb[s + 1];
      rgb[t * 3 + 2] += img.rgb[s + 2];
      count[t]++;
    }
  }
  for (let t = 0; t < w * h; t++) {
    const k = 1 / Math.max(count[t], 1);
    rgb[t * 3] *= k;
    rgb[t * 3 + 1] *= k;
    rgb[t * 3 + 2] *= k;
  }
  return { w, h, rgb };
}

/** Box blur of one channel, with the window cut at the borders. */
export function boxBlur(values, w, h, radius) {
  const across = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    let sum = 0;
    let n = 0;
    for (let x = -radius; x < w; x++) {
      if (x + radius < w) {
        sum += values[y * w + x + radius];
        n++;
      }
      if (x - radius - 1 >= 0) {
        sum -= values[y * w + x - radius - 1];
        n--;
      }
      if (x >= 0) across[y * w + x] = sum / n;
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    let n = 0;
    for (let y = -radius; y < h; y++) {
      if (y + radius < h) {
        sum += across[(y + radius) * w + x];
        n++;
      }
      if (y - radius - 1 >= 0) {
        sum -= across[(y - radius - 1) * w + x];
        n--;
      }
      if (y >= 0) out[y * w + x] = sum / n;
    }
  }
  return out;
}

export function median(values) {
  const sorted = Float32Array.from(values).sort();
  return sorted.length ? sorted[sorted.length >> 1] : 0;
}

export function percentile(values, share) {
  const sorted = Float32Array.from(values).sort();
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] : 0;
}
