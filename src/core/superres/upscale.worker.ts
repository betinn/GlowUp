/**
 * Upscales a photo away from the page, tile by tile, so the editor keeps answering while it runs. The model and
 * the runtime are files of this site, handed over as bytes by the page, which counted them as they came. The photo
 * never leaves the device: this worker talks to nothing but the page.
 *
 * The GPU runs it when the browser has WebGPU. Otherwise the same runtime runs it on the processor, much slower.
 */

import * as ort from 'onnxruntime-web/webgpu';
import { planUpscale, runUpscale } from './tiles';

export type Backend = 'webgpu' | 'wasm';

export type UpscaleAsk =
  | { id: number; kind: 'load'; model: ArrayBuffer; runtime: ArrayBuffer; gpu: boolean }
  | { id: number; kind: 'run'; rgba: ArrayBuffer; w: number; h: number; scale: number; tile: number }
  | { id: number; kind: 'cancel' };

export type UpscaleAnswer =
  | { id: number; kind: 'loaded'; backend: Backend }
  | { id: number; kind: 'tile'; done: number; total: number }
  | { id: number; kind: 'done'; rgba: ArrayBuffer }
  | { id: number; kind: 'stopped' }
  | { id: number; kind: 'failed'; message: string };

let session: ort.InferenceSession | null = null;
/** Jobs asked to stop. A job looks here between tiles. */
const cancelled = new Set<number>();

const post = (answer: UpscaleAnswer, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(answer, transfer);

async function load(model: ArrayBuffer, runtime: ArrayBuffer, gpu: boolean): Promise<Backend> {
  ort.env.wasm.wasmBinary = runtime;
  // Threads would need workers of their own, made from a blob, which the policy of the site does not allow.
  ort.env.wasm.numThreads = 1;
  ort.env.logLevel = 'error';
  const bytes = new Uint8Array(model);
  if (gpu && 'gpu' in navigator) {
    try {
      session = await ort.InferenceSession.create(bytes, { executionProviders: ['webgpu'], graphOptimizationLevel: 'all', logSeverityLevel: 3 });
      // A tiny run proves the device can do the math of the model, half floats included.
      await upscaleTile(new Uint8Array(3 * 16 * 16), 16, 16);
      return 'webgpu';
    } catch {
      // No adapter, or a driver that refuses: the processor still can.
      await session?.release();
      session = null;
    }
  }
  session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all', logSeverityLevel: 3 });
  return 'wasm';
}

async function upscaleTile(rgb: Uint8Array, w: number, h: number): Promise<Uint8Array> {
  if (!session) throw new Error('not-loaded');
  const input = new Float32Array(rgb.length);
  for (let i = 0; i < rgb.length; i++) input[i] = rgb[i] / 255;
  const result = await session.run({ image: new ort.Tensor('float32', input, [1, 3, h, w]) });
  const out = result.upscaled;
  const data = (await out.getData()) as Float32Array;
  const bytes = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) bytes[i] = Math.min(255, Math.max(0, Math.round(data[i] * 255)));
  out.dispose();
  return bytes;
}

/** Lets messages in, a cancel among them: the runtime alone may never give the loop a turn. */
const breathe = () => new Promise((resolve) => setTimeout(resolve));

async function run(id: number, rgba: ArrayBuffer, w: number, h: number, scale: number, tile: number): Promise<void> {
  const plan = planUpscale(w, h, scale, tile);
  const upscale = async (rgb: Uint8Array, tw: number, th: number) => {
    const big = await upscaleTile(rgb, tw, th);
    // After each tile, so a cancel sent while it ran is seen before the next.
    await breathe();
    return big;
  };
  const out = await runUpscale(new Uint8Array(rgba), plan, upscale, {
    tile: (done, total) => post({ id, kind: 'tile', done, total }),
    stopped: () => cancelled.has(id),
  });
  if (!out || cancelled.has(id)) {
    cancelled.delete(id);
    post({ id, kind: 'stopped' });
    return;
  }
  post({ id, kind: 'done', rgba: out.buffer as ArrayBuffer }, [out.buffer]);
}

self.onmessage = (event: MessageEvent<UpscaleAsk>) => {
  const ask = event.data;
  if (ask.kind === 'cancel') {
    cancelled.add(ask.id);
    return;
  }
  const work =
    ask.kind === 'load'
      ? load(ask.model, ask.runtime, ask.gpu).then((backend) => post({ id: ask.id, kind: 'loaded', backend }))
      : run(ask.id, ask.rgba, ask.w, ask.h, ask.scale, ask.tile);
  work.catch((err: unknown) => post({ id: ask.id, kind: 'failed', message: err instanceof Error ? err.message : String(err) }));
};
