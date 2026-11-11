/**
 * The two models of Luzes, on the side of the page: Depth Anything V2 Small reads how far each point of the photo
 * is, and MODNet reads the matte of the person. They download once, on the first light, with real byte counts,
 * and run in a worker, so the editor keeps answering. The photo never leaves the device.
 */

import { depthSize, matteSize, type Grid } from '../core/light/models';
import type { Backend, SceneAnswer, SceneAsk, Shot } from '../core/light/scene.worker';
import type { SourceImage } from '../core/source';
import { onPhone } from './device';
import { download } from './download';
import { FILL_RUNTIME_BYTES } from './fill.svelte';

/** Sizes of the models after decompression, for a real percentage even when the server sends brotli. */
export const DEPTH_MODEL_BYTES = 49_642_442;
export const MATTE_MODEL_BYTES = 12_984_781;
/** On the wire, with brotli: depth 44 MB, matte 11 MB, and the runtime 4 MB, which the fill or the upscale may have brought already. */
export const SCENE_DOWNLOAD_MB = 59;

/** What the models read in one photo, each on its own grid. */
export interface SceneRead {
  depth: Float32Array;
  dw: number;
  dh: number;
  matte: Float32Array;
  mw: number;
  mh: number;
}

let worker: Worker | null = null;
let backend: Backend | null = null;
let loading: Promise<Backend> | null = null;
let asks = 0;
const waiting = new Map<number, (answer: SceneAnswer) => void>();

/** The models are loaded, so a new photo is read with no download. */
export const sceneModelsStarted = () => !!backend;

/** WebGPU in this browser, with a GPU behind it. The worker still proves the GPU can run the depth model. */
async function gpuFits(): Promise<boolean> {
  try {
    // Tests and measurements can keep the models on the processor.
    if (localStorage.getItem('glowup.sceneGpu') === 'off') return false;
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    return !!(await gpu?.requestAdapter());
  } catch {
    return false;
  }
}

function drop(): void {
  worker?.terminate();
  worker = null;
  backend = null;
  loading = null;
}

function ask(message: SceneAsk, transfer: Transferable[], step?: (answer: SceneAnswer) => void): Promise<SceneAnswer> {
  return new Promise((resolve) => {
    waiting.set(message.id, (answer) => {
      if (answer.kind === 'step') {
        step?.(answer);
        return;
      }
      waiting.delete(message.id);
      resolve(answer);
    });
    worker!.postMessage(message, transfer);
  });
}

/** Downloads the models and starts them, once. `progress` gets the share of the bytes that arrived. */
export function loadSceneModels(progress: (fraction: number) => void): Promise<Backend> {
  if (backend) return Promise.resolve(backend);
  if (loading) return loading;
  loading = (async () => {
    const [{ default: depthUrl }, { default: matteUrl }, { default: runtimeUrl }] = await Promise.all([
      import('../core/light/depth_anything_v2_small.onnx?url'),
      import('../core/light/modnet.onnx?url'),
      import('onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url'),
    ]);
    const total = DEPTH_MODEL_BYTES + MATTE_MODEL_BYTES + FILL_RUNTIME_BYTES;
    let received = 0;
    const count = (bytes: number) => {
      received += bytes;
      progress(Math.min(1, received / total));
    };
    const [depth, matte, runtime, gpu] = await Promise.all([download(depthUrl, count), download(matteUrl, count), download(runtimeUrl, count), gpuFits()]);
    const w = new Worker(new URL('../core/light/scene.worker.ts', import.meta.url), { type: 'module' });
    worker = w;
    w.onmessage = (event: MessageEvent<SceneAnswer>) => waiting.get(event.data.id)?.(event.data);
    w.onerror = (event) => {
      // A worker that fell over is gone, models and all: the next light starts it again.
      if (worker === w) drop();
      for (const answer of [...waiting.values()]) answer({ id: -1, kind: 'failed', message: event.message || 'worker-failed' });
    };
    const answer = await ask({ id: ++asks, kind: 'load', depth, matte, runtime, gpu }, [depth, matte, runtime]);
    if (answer.kind !== 'loaded') throw new Error(answer.kind === 'failed' ? answer.message : 'load-failed');
    backend = answer.backend;
    return answer.backend;
  })();
  loading.catch(drop);
  return loading;
}

/** The photo at the size a model reads it. */
function shot(source: SourceImage, grid: Grid): Shot {
  const pixels = source.draw(0, 0, source.w, source.h, grid.w, grid.h).getContext('2d')!.getImageData(0, 0, grid.w, grid.h).data;
  return { rgba: pixels.buffer as ArrayBuffer, w: grid.w, h: grid.h };
}

/** Reads the depth and the matte of a photo. The models must be loaded. `step` gets the share done. */
export async function readScene(source: SourceImage, step: (fraction: number) => void): Promise<SceneRead> {
  if (!worker || !backend) throw new Error('scene-models-not-loaded');
  const depth = shot(source, depthSize(source.w, source.h));
  const matte = shot(source, matteSize(source.w, source.h));
  const answer = await ask({ id: ++asks, kind: 'run', depth, matte }, [depth.rgba, matte.rgba], (s) => {
    if (s.kind === 'step') step(s.done / s.total);
  });
  // A phone keeps its memory for the photo: the models leave, and a next photo starts them again from the cache.
  if (onPhone()) drop();
  if (answer.kind !== 'done') throw new Error(answer.kind === 'failed' ? answer.message : 'scene-failed');
  return { depth: new Float32Array(answer.depth), dw: answer.dw, dh: answer.dh, matte: new Float32Array(answer.matte), mw: answer.mw, mh: answer.mh };
}
