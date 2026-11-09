/**
 * Completes the plates of the open photo with the inpainting model, in the background: what a head or a person
 * uncovers when a warp moves it. The quick guess is already there, so nobody waits to move a slider, and the
 * finished plates replace it when they are ready. The work shows as a progress card with the time left, measured
 * on this device, and it can be stopped.
 */

import type { Engine } from '../core/engine';
import { completePlates, type Inpaint } from '../core/face/complete';
import type { InpaintAnswer, InpaintAsk } from '../core/face/inpaint.worker';
import { timeLeft, type Stage } from '../core/progress';
import { bump } from './state.svelte';
import { Task } from './task.svelte';

/** Sizes after decompression, for a real percentage even when the server sends brotli. */
export const FILL_MODEL_BYTES = 28_079_181;
export const FILL_RUNTIME_BYTES = 28_747_738;

/** Where the time one tile takes on this device is kept, for each way of running the model. */
const SPEED_KEY = 'glowup.fillTileMs';
/** Before anything was measured: what a tile took on the machines this was built on. */
const USUAL_TILE_MS = { webgpu: 150, wasm: 2200 };
/** Where the time the model took to start on this device is kept, and what it usually takes. */
const START_KEY = 'glowup.fillStartMs';
const USUAL_START_MS = 2500;

export type FillState = 'idle' | 'download' | 'running' | 'done' | 'off' | 'failed';

export const fill = $state({
  state: 'idle' as FillState,
  task: null as Task | null,
  /** The time left, in words. Empty until there is something to go by. */
  left: '',
  /** How the model runs here, once it is loaded. */
  backend: '' as '' | 'webgpu' | 'wasm',
});

let worker: Worker | null = null;
let backend: 'webgpu' | 'wasm' | null = null;
let loading: Promise<'webgpu' | 'wasm'> | null = null;
let asks = 0;
const waiting = new Map<number, { resolve(answer: InpaintAnswer): void; reject(err: Error): void }>();
/** Counts the jobs, so an older one knows it was replaced. */
let current = 0;
/** The layers the finished plates belong to, so the same photo is not filled twice. */
let doneFor: { engine: Engine; rev: number } | null = null;
let settled: Promise<void> = Promise.resolve();

function ask(message: InpaintAsk, transfer: Transferable[]): Promise<InpaintAnswer> {
  return new Promise((resolve, reject) => {
    waiting.set(message.id, { resolve, reject });
    worker!.postMessage(message, transfer);
  });
}

async function download(url: string, onBytes: (count: number) => void): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`download-failed: ${response.status}`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
    onBytes(value.byteLength);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  return bytes.buffer;
}

/** Downloads the model and its runtime once, and starts them in the worker. A failed attempt can be tried again. */
function loadModel(progress: (fraction: number) => void, starting: () => void): Promise<'webgpu' | 'wasm'> {
  if (backend) return Promise.resolve(backend);
  loading ??= (async () => {
    const [{ default: modelUrl }, { default: runtimeUrl }] = await Promise.all([import('../core/face/migan_inpaint.onnx?url'), import('onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url')]);
    const total = FILL_MODEL_BYTES + FILL_RUNTIME_BYTES;
    let received = 0;
    const count = (bytes: number) => {
      received += bytes;
      progress(Math.min(1, received / total));
    };
    const [model, runtime] = await Promise.all([download(modelUrl, count), download(runtimeUrl, count)]);
    starting();
    worker = new Worker(new URL('../core/face/inpaint.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<InpaintAnswer>) => {
      const answer = event.data;
      const pending = waiting.get(answer.id);
      waiting.delete(answer.id);
      if (!pending) return;
      if (answer.kind === 'failed') pending.reject(new Error(answer.message));
      else pending.resolve(answer);
    };
    worker.onerror = (event) => {
      for (const pending of waiting.values()) pending.reject(new Error(event.message || 'worker-failed'));
      waiting.clear();
    };
    const answer = await ask({ id: ++asks, kind: 'load', model, runtime }, [model, runtime]);
    if (answer.kind !== 'loaded') throw new Error('load-failed');
    backend = answer.backend;
    return answer.backend;
  })();
  loading.catch(() => {
    loading = null;
    worker?.terminate();
    worker = null;
  });
  return loading;
}

const inpaint: Inpaint = async (rgb, known, w, h) => {
  const answer = await ask({ id: ++asks, kind: 'fill', rgb, known, w, h }, [rgb.buffer, known.buffer]);
  if (answer.kind !== 'filled') throw new Error('fill-failed');
  return answer.rgb;
};

/** A number this device measured before, or null. */
function keptNumber(key: string): number | null {
  try {
    const kept = Number(localStorage.getItem(key));
    return kept > 0 ? kept : null;
  } catch {
    return null;
  }
}

function keepNumber(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(Math.round(value)));
  } catch {
    // A convenience only.
  }
}

function tileSpeed(how: 'webgpu' | 'wasm'): number {
  try {
    const kept = JSON.parse(localStorage.getItem(SPEED_KEY) ?? '{}') as Record<string, number>;
    if (kept[how] > 0) return kept[how];
  } catch {
    // Storage can be blocked. The usual time stands in.
  }
  return USUAL_TILE_MS[how];
}

function keepSpeed(how: 'webgpu' | 'wasm', ms: number): void {
  try {
    const kept = JSON.parse(localStorage.getItem(SPEED_KEY) ?? '{}') as Record<string, number>;
    kept[how] = Math.round(ms);
    localStorage.setItem(SPEED_KEY, JSON.stringify(kept));
  } catch {
    // A convenience only.
  }
}

/** Tests keep the completion from starting by itself, so only the ones about it pay for the model. */
function held(): boolean {
  try {
    return localStorage.getItem('glowup.fill') === 'off';
  } catch {
    return false;
  }
}

/**
 * Starts the completion for the layers of the open photo, unless it is done or running. `why` says who asks. A
 * tool of the face menu that opens asks for it at once, so the plates are ready by the time a slider moves. A
 * project that opens asks only if it already holds a warp. And a person who stopped it, or saw it fail, is the
 * only one who starts it again.
 */
export function startFill(e: Engine, why: 'tool' | 'project' | 'asked'): void {
  const data = e.plateData();
  if (!data) return;
  if (why === 'project' && !e.doc.hasField) return;
  if (doneFor?.engine === e && doneFor.rev === data.rev) return;
  if (fill.state === 'download' || fill.state === 'running') return;
  if ((fill.state === 'off' || fill.state === 'failed') && why !== 'asked') return;
  if (why !== 'asked' && held()) {
    fill.state = 'off';
    bump();
    return;
  }
  const mine = ++current;
  const stopped = () => mine !== current || e.plateData()?.rev !== data.rev;
  const stages: Stage[] = [];
  if (!backend) stages.push({ id: 'download', label: 'Baixando o modelo de preenchimento', weight: 50 }, { id: 'start', label: 'Ligando o modelo', weight: 8, estimate: 2500 });
  stages.push({ id: 'fill', label: 'Completando o que fica atrás', weight: 50 });
  const task = new Task(stages);
  fill.task = task;
  fill.left = '';
  fill.state = backend ? 'running' : 'download';
  bump();
  settled = (async () => {
    try {
      if (!backend) task.stage('download');
      let startedAt = 0;
      const how = await loadModel(
        (fraction) => task.timed(fraction),
        () => {
          startedAt = performance.now();
          task.stage('start', timeLeft(keptNumber(START_KEY) ?? USUAL_START_MS));
        },
      );
      if (startedAt) keepNumber(START_KEY, performance.now() - startedAt);
      fill.backend = how;
      if (stopped()) return;
      fill.state = 'running';
      task.stage('fill');
      // The first tile also pays for getting the model ready, so only the ones after it are timed.
      let timed = 0;
      let spent = 0;
      let perTile = tileSpeed(how);
      let last = performance.now();
      const ok = await completePlates(data, inpaint, {
        tile(done, total) {
          const now = performance.now();
          if (done > 1) {
            spent += now - last;
            perTile = spent / ++timed;
          }
          last = now;
          fill.left = total > done ? timeLeft((total - done) * perTile) : '';
          task.report(done / total, fill.left);
        },
        plate: (which, plate) => e.setPlate(which, plate, data.rev),
        stopped,
      });
      if (!ok || stopped()) return;
      if (timed > 0) keepSpeed(how, perTile);
      doneFor = { engine: e, rev: data.rev };
      task.finish('Pronto');
      fill.left = '';
      fill.state = 'done';
    } catch (err) {
      console.error(err);
      if (mine === current) fill.state = 'failed';
    } finally {
      task.stop();
      if (mine === current && fill.state !== 'done' && fill.state !== 'failed') fill.state = fill.state === 'off' ? 'off' : 'idle';
      bump();
    }
  })();
}

/** Stops the completion. The quick guess stays, and the card offers to start again. */
export function cancelFill(): void {
  if (fill.state !== 'download' && fill.state !== 'running') return;
  current++;
  fill.state = 'off';
  fill.left = '';
  bump();
}

/** Resolves when no completion is running: an export waits for it, so it never saves the quick guess by accident. */
export function fillSettled(): Promise<void> {
  return settled;
}

/** A new photo: nothing of the last one counts. The model stays loaded. */
export function forgetFill(): void {
  current++;
  doneFor = null;
  fill.state = 'idle';
  fill.task?.stop();
  fill.task = null;
  fill.left = '';
}
