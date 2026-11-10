/**
 * Runs the inpainting model away from the page, so a long fill never freezes the interface. The model and the
 * runtime are files of this site, handed over as bytes by the page, which counted them as they came. The photo
 * never leaves the device: this worker talks to nothing but the page.
 *
 * The GPU runs it when the browser has WebGPU. Otherwise the same runtime runs it on the processor, slower.
 */

import * as ort from 'onnxruntime-web/webgpu';

export type InpaintAsk =
  | { id: number; kind: 'load'; model: ArrayBuffer; runtime: ArrayBuffer }
  | { id: number; kind: 'fill'; rgb: Uint8Array; known: Uint8Array; w: number; h: number };

export type InpaintAnswer =
  | { id: number; kind: 'loaded'; backend: 'webgpu' | 'wasm' }
  | { id: number; kind: 'filled'; rgb: Uint8Array }
  | { id: number; kind: 'failed'; message: string };

let session: ort.InferenceSession | null = null;

async function load(model: ArrayBuffer, runtime: ArrayBuffer): Promise<'webgpu' | 'wasm'> {
  ort.env.wasm.wasmBinary = runtime;
  // Threads would need workers of their own, made from a blob, which the policy of the site does not allow.
  ort.env.wasm.numThreads = 1;
  ort.env.logLevel = 'error';
  const bytes = new Uint8Array(model);
  if ('gpu' in navigator) {
    try {
      session = await ort.InferenceSession.create(bytes, { executionProviders: ['webgpu'], graphOptimizationLevel: 'all', logSeverityLevel: 3 });
      return 'webgpu';
    } catch {
      // No adapter, or a driver that refuses: the processor still can.
    }
  }
  session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all', logSeverityLevel: 3 });
  return 'wasm';
}

async function fill(rgb: Uint8Array, known: Uint8Array, w: number, h: number): Promise<Uint8Array> {
  if (!session) throw new Error('not-loaded');
  const result = await session.run({
    image: new ort.Tensor('uint8', rgb, [1, 3, h, w]),
    mask: new ort.Tensor('uint8', known, [1, 1, h, w]),
  });
  const out = result.result;
  const data = (await out.getData()) as Uint8Array;
  const copy = new Uint8Array(data);
  out.dispose();
  return copy;
}

const post = (answer: InpaintAnswer, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(answer, transfer);

self.onmessage = (event: MessageEvent<InpaintAsk>) => {
  const ask = event.data;
  const work = ask.kind === 'load' ? load(ask.model, ask.runtime).then((backend) => post({ id: ask.id, kind: 'loaded', backend })) : fill(ask.rgb, ask.known, ask.w, ask.h).then((rgb) => post({ id: ask.id, kind: 'filled', rgb }, [rgb.buffer]));
  work.catch((err: unknown) => post({ id: ask.id, kind: 'failed', message: err instanceof Error ? err.message : String(err) }));
};
