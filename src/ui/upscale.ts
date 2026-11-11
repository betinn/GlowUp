/**
 * Upscales a photo with Real-ESRGAN, on this device, for the tool "Aumentar resolução" and for the option of the
 * export. The model downloads once, on first use, and runs in a worker, so the editor keeps answering. Each step
 * says how far it is and how long it still needs, and every step can be stopped.
 */

import type { Backend, UpscaleAnswer, UpscaleAsk } from '../core/superres/upscale.worker';
import { leftFrom, timeLeft } from '../core/progress';
import type { Scale } from '../core/superres/size';
import { planUpscale, tileCount } from '../core/superres/tiles';
import { onPhone } from './device';
import { download } from './download';
import { FILL_RUNTIME_BYTES } from './fill.svelte';

/** Size of the model after decompression, for a real percentage even when the server sends brotli. */
export const UPSCALE_MODEL_BYTES = 33_748_869;
/** On the wire, with brotli: the model 31 MB and the runtime 5 MB, which the fill may have brought already. */
export const UPSCALE_DOWNLOAD_MB = 36;

/** Where the time per megapixel of photo is kept on this device, for each way of running the model. */
const SPEED_KEY = 'glowup.upscaleMsPerMp';
/** Before anything was measured: what a megapixel took on the machine this was built on, 4× slower for a phone. */
const USUAL_MS_PER_MP: Record<Backend, number> = { webgpu: 14_000, wasm: 2_500_000 };
const START_KEY = 'glowup.upscaleStartMs';
const USUAL_START_MS = 3000;

/** Side of a tile, in pixels of the photo. The GPU of a computer takes larger ones; the rest keep memory low. */
function tileFor(how: Backend): number {
  try {
    // Tests force small tiles, to see many seams on a small photo.
    const forced = Number(localStorage.getItem('glowup.upscaleTile'));
    if (forced > 0) return forced;
  } catch {
    // Storage can be blocked.
  }
  return how === 'webgpu' && !onPhone() ? 256 : 128;
}

/**
 * The model could not be brought to this device: no connection, or the site did not answer. Nothing is wrong with
 * the photo or the device, and the next try downloads again.
 */
export class ModelDownloadError extends Error {
  constructor(cause: unknown) {
    super(`model-download: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
    this.name = 'ModelDownloadError';
  }
}

/** Why an upscale failed, in the terms the person can act on. */
export type UpscaleFailure = 'download' | 'upscale';

export const upscaleFailure = (err: unknown): UpscaleFailure => (err instanceof ModelDownloadError ? 'download' : 'upscale');

export interface UpscaleHooks {
  /** The model is downloading: the share that arrived, and the time left in words. */
  downloading(fraction: number, left: string): void;
  /** The model is starting: the time it took last time on this device, in words. */
  starting(left: string): void;
  /** The model is working: the share of the photo done, and the time left in words. */
  running(fraction: number, left: string): void;
}

let worker: Worker | null = null;
let backend: Backend | null = null;
let loading: Promise<Backend> | null = null;
let abort: AbortController | null = null;
let asks = 0;
const waiting = new Map<number, (answer: UpscaleAnswer) => void>();
/** The job running now, so a cancel knows what to stop. */
let current: { id: number; stop(): void } | null = null;

function keptSpeed(how: Backend): number {
  try {
    const kept = JSON.parse(localStorage.getItem(SPEED_KEY) ?? '{}') as Record<string, number>;
    if (kept[how] > 0) return kept[how];
  } catch {
    // The usual time stands in.
  }
  return USUAL_MS_PER_MP[how] * (onPhone() ? 4 : 1);
}

function keepSpeed(how: Backend, msPerMp: number): void {
  try {
    const kept = JSON.parse(localStorage.getItem(SPEED_KEY) ?? '{}') as Record<string, number>;
    kept[how] = Math.round(msPerMp);
    localStorage.setItem(SPEED_KEY, JSON.stringify(kept));
  } catch {
    // A convenience only.
  }
}

function keptStart(): number {
  try {
    const kept = Number(localStorage.getItem(START_KEY));
    return kept > 0 ? kept : USUAL_START_MS;
  } catch {
    return USUAL_START_MS;
  }
}

function keepStart(ms: number): void {
  try {
    localStorage.setItem(START_KEY, String(Math.round(ms)));
  } catch {
    // A convenience only.
  }
}

/** How long a photo of this many pixels takes here, as far as this device knows, in milliseconds. */
export function expectedMs(pixels: number): number {
  return (pixels / 1e6) * keptSpeed(backend ?? ('gpu' in navigator ? 'webgpu' : 'wasm'));
}

/** The model is loaded, so a new job starts with no download. */
export const upscaleReady = () => !!backend;

/** WebGPU in this browser, with a GPU behind it. The worker still proves the GPU can run the model. */
async function gpuFits(): Promise<boolean> {
  try {
    // Tests and measurements can keep the model on the processor.
    if (localStorage.getItem('glowup.upscaleGpu') === 'off') return false;
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    return !!(await gpu?.requestAdapter());
  } catch {
    return false;
  }
}

function send(message: UpscaleAsk, transfer: Transferable[] = []): void {
  worker!.postMessage(message, transfer);
}

function loadModel(hooks: UpscaleHooks): Promise<Backend> {
  if (backend) return Promise.resolve(backend);
  if (loading) return loading;
  const controller = new AbortController();
  abort = controller;
  loading = (async () => {
    // All of this comes from the site: with no connection, or a server that went away, it fails here, and the
    // person is told to check the connection rather than to try another format.
    const [model, runtime, gpu] = await (async () => {
      try {
        const [{ default: modelUrl }, { default: runtimeUrl }] = await Promise.all([import('../core/superres/realesrgan_x4plus.onnx?url'), import('onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url')]);
        const total = UPSCALE_MODEL_BYTES + FILL_RUNTIME_BYTES;
        const began = performance.now();
        let received = 0;
        const count = (bytes: number) => {
          received += bytes;
          const fraction = Math.min(1, received / total);
          hooks.downloading(fraction, leftFrom(performance.now() - began, fraction));
        };
        return await Promise.all([download(modelUrl, count, controller.signal), download(runtimeUrl, count, controller.signal), gpuFits()]);
      } catch (err) {
        throw new ModelDownloadError(err);
      }
    })();
    hooks.starting(timeLeft(keptStart()));
    const startedAt = performance.now();
    const w = new Worker(new URL('../core/superres/upscale.worker.ts', import.meta.url), { type: 'module' });
    worker = w;
    w.onmessage = (event: MessageEvent<UpscaleAnswer>) => waiting.get(event.data.id)?.(event.data);
    w.onerror = (event) => {
      // A worker that fell over is gone, model and all: the next job starts it again.
      if (worker === w) {
        worker = null;
        backend = null;
        loading = null;
        w.terminate();
      }
      for (const answer of waiting.values()) answer({ id: -1, kind: 'failed', message: event.message || 'worker-failed' });
    };
    const id = ++asks;
    const answer = await new Promise<UpscaleAnswer>((resolve) => {
      waiting.set(id, resolve);
      send({ id, kind: 'load', model, runtime, gpu }, [model, runtime]);
    });
    waiting.delete(id);
    if (answer.kind !== 'loaded') throw new Error(answer.kind === 'failed' ? answer.message : 'load-failed');
    keepStart(performance.now() - startedAt);
    backend = answer.backend;
    return answer.backend;
  })();
  loading
    .catch(() => {
      loading = null;
      worker?.terminate();
      worker = null;
    })
    .finally(() => {
      if (abort === controller) abort = null;
    });
  return loading;
}

/**
 * Upscales a photo by `scale`. Null when it was stopped. Throws when the model does not load or fails, and the
 * photo given stays as it was: a `ModelDownloadError` when the model could not be downloaded.
 */
export async function upscaleImage(image: ImageData, scale: Scale, hooks: UpscaleHooks): Promise<ImageData | null> {
  if (current) throw new Error('upscale-busy');
  let stopped = false;
  let finish: (answer: UpscaleAnswer | null) => void = () => {};
  const job = {
    id: 0,
    stop() {
      stopped = true;
      abort?.abort();
      if (job.id) send({ id: job.id, kind: 'cancel' });
      finish(null);
    },
  };
  current = job;
  const ended = new Promise<UpscaleAnswer | null>((resolve) => (finish = resolve));
  try {
    const how = await Promise.race([loadModel(hooks), ended.then(() => null)]);
    if (!how || stopped) return null;
    const id = ++asks;
    job.id = id;
    const { width: w, height: h } = image;
    const pixels = w * h;
    const tile = tileFor(how);
    const began = performance.now();
    let perMp = keptSpeed(how);
    let lastDone = 0;
    let lastAt = began;
    let firstAt = 0;
    let doneCount = 0;
    const totalCount = tileCount(planUpscale(w, h, scale, tile));
    // Between tiles the bar keeps going at the pace measured so far, never past the next tile.
    const tick = () => {
      const now = performance.now();
      const perTile = doneCount > 1 ? (lastAt - firstAt) / (doneCount - 1) : (perMp * pixels) / 1e6 / totalCount;
      const inside = Math.min(0.9, (now - lastAt) / Math.max(perTile, 1));
      const fraction = Math.min(1, (doneCount + inside) / totalCount);
      const left = Math.max(0, (totalCount - doneCount) * perTile - (now - lastAt));
      hooks.running(fraction, left > 0 ? timeLeft(left) : '');
    };
    hooks.running(0, timeLeft((perMp * pixels) / 1e6));
    const timer = setInterval(tick, 250);
    waiting.set(id, (answer) => {
      if (answer.kind === 'tile') {
        const now = performance.now();
        doneCount = answer.done;
        // The first tile also pays for getting the GPU ready, so the pace comes from the ones after it.
        if (answer.done === 1) firstAt = now;
        lastAt = now;
        lastDone = answer.done;
        tick();
        return;
      }
      finish(answer);
    });
    const rgba = image.data.slice().buffer;
    send({ id, kind: 'run', rgba, w, h, scale, tile }, [rgba]);
    const answer = await ended;
    clearInterval(timer);
    waiting.delete(id);
    if (!answer || answer.kind === 'stopped') return null;
    if (answer.kind === 'failed') throw new Error(answer.message);
    if (answer.kind !== 'done') throw new Error('upscale-failed');
    if (lastDone > 1) {
      perMp = (((lastAt - firstAt) / (lastDone - 1)) * lastDone * 1e6) / pixels;
      keepSpeed(how, perMp);
    }
    return new ImageData(new Uint8ClampedArray(answer.rgba), w * scale, h * scale);
  } finally {
    if (current === job) current = null;
  }
}

/** Stops the upscale running now, on download or on the model. The photo stays as it was. */
export function cancelUpscale(): void {
  current?.stop();
}

/** Upscales what a canvas holds into a new canvas. Null when it was stopped. */
export async function upscaleCanvas(canvas: OffscreenCanvas, scale: Scale, hooks: UpscaleHooks): Promise<OffscreenCanvas | null> {
  const c = canvas.getContext('2d');
  if (!c) throw new Error('canvas-unavailable');
  const big = await upscaleImage(c.getImageData(0, 0, canvas.width, canvas.height), scale, hooks);
  if (!big) return null;
  const out = new OffscreenCanvas(big.width, big.height);
  const o = out.getContext('2d', { alpha: false });
  if (!o) throw new Error('canvas-unavailable');
  o.putImageData(big, 0, 0);
  return out;
}
