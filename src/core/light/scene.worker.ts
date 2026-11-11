/**
 * Reads the depth of a photo and the matte of the person in it, away from the page, so the editor keeps answering
 * while the two models run. The models and the runtime are files of this site, handed over as bytes by the page,
 * which counted them as they came. The photo never leaves the device: this worker talks to nothing but the page.
 *
 * The GPU runs the depth model when the browser has WebGPU. Otherwise the same runtime runs it on the processor,
 * slower. The matte model always runs on the processor: on WebGPU this runtime gives a wrong matte for it, with
 * no error to tell.
 */

import * as ort from 'onnxruntime-web/webgpu';
import { DEPTH_NORM, MATTE_NORM, toPlanes } from './models';

export type Backend = 'webgpu' | 'wasm';

/** A photo already at the size a model reads it. */
export interface Shot {
  rgba: ArrayBuffer;
  w: number;
  h: number;
}

export type SceneAsk = { id: number; kind: 'load'; depth: ArrayBuffer; matte: ArrayBuffer; runtime: ArrayBuffer; gpu: boolean } | { id: number; kind: 'run'; depth: Shot; matte: Shot };

export type SceneAnswer =
  | { id: number; kind: 'loaded'; backend: Backend }
  /** One of the two models ended: the page moves its bar. */
  | { id: number; kind: 'step'; done: number; total: number }
  | { id: number; kind: 'done'; depth: ArrayBuffer; dw: number; dh: number; matte: ArrayBuffer; mw: number; mh: number; depthMs: number; matteMs: number }
  | { id: number; kind: 'failed'; message: string };

let depthSession: ort.InferenceSession | null = null;
let matteSession: ort.InferenceSession | null = null;

const post = (answer: SceneAnswer, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(answer, transfer);

async function infer(session: ort.InferenceSession, input: string, output: string, shot: Shot, norm: { mean: readonly number[]; std: readonly number[] }): Promise<Float32Array> {
  const planes = toPlanes(new Uint8Array(shot.rgba), shot.w, shot.h, norm);
  const result = await session.run({ [input]: new ort.Tensor('float32', planes, [1, 3, shot.h, shot.w]) });
  const out = result[output];
  const data = Float32Array.from((await out.getData()) as Float32Array);
  out.dispose();
  return data;
}

const readDepth = (shot: Shot) => infer(depthSession!, 'pixel_values', 'predicted_depth', shot, DEPTH_NORM);
const readMatte = (shot: Shot) => infer(matteSession!, 'input', 'output', shot, MATTE_NORM);

const options = (how: Backend): ort.InferenceSession.SessionOptions => ({ executionProviders: [how], graphOptimizationLevel: 'all', logSeverityLevel: 3 });

async function load(depth: ArrayBuffer, matte: ArrayBuffer, runtime: ArrayBuffer, gpu: boolean): Promise<Backend> {
  ort.env.wasm.wasmBinary = runtime;
  // Threads would need workers of their own, made from a blob, which the policy of the site does not allow.
  ort.env.wasm.numThreads = 1;
  ort.env.logLevel = 'error';
  const depthBytes = new Uint8Array(depth);
  matteSession = await ort.InferenceSession.create(new Uint8Array(matte), options('wasm'));
  if (gpu && 'gpu' in navigator) {
    try {
      depthSession = await ort.InferenceSession.create(depthBytes, options('webgpu'));
      // A tiny run proves the device can do the math of the model, half floats included.
      const side = 56;
      const d = await readDepth({ rgba: new ArrayBuffer(side * side * 4), w: side, h: side });
      if (!d.every(Number.isFinite)) throw new Error('not-finite');
      return 'webgpu';
    } catch {
      // No adapter, or a driver that refuses: the processor still can.
      await depthSession?.release().catch(() => undefined);
      depthSession = null;
    }
  }
  depthSession = await ort.InferenceSession.create(depthBytes, options('wasm'));
  return 'wasm';
}

async function run(id: number, depth: Shot, matte: Shot): Promise<void> {
  if (!depthSession || !matteSession) throw new Error('not-loaded');
  const began = performance.now();
  const d = await readDepth(depth);
  const middle = performance.now();
  post({ id, kind: 'step', done: 1, total: 2 });
  const m = await readMatte(matte);
  const depthMs = Math.round(middle - began);
  const matteMs = Math.round(performance.now() - middle);
  post({ id, kind: 'done', depth: d.buffer as ArrayBuffer, dw: depth.w, dh: depth.h, matte: m.buffer as ArrayBuffer, mw: matte.w, mh: matte.h, depthMs, matteMs }, [d.buffer, m.buffer]);
}

self.onmessage = (event: MessageEvent<SceneAsk>) => {
  const ask = event.data;
  const work = ask.kind === 'load' ? load(ask.depth, ask.matte, ask.runtime, ask.gpu).then((backend) => post({ id: ask.id, kind: 'loaded', backend })) : run(ask.id, ask.depth, ask.matte);
  work.catch((err: unknown) => post({ id: ask.id, kind: 'failed', message: err instanceof Error ? err.message : String(err) }));
};
