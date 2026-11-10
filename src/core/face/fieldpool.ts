/**
 * The workers that work out the field of the face sliders. They start the first time a slider moves and stay
 * for the rest of the visit. One fewer than the processor has cores, two at least and four at most, so the page
 * keeps a core for itself.
 */

import type { FieldAnswer, FieldAsk } from './field.worker';
import { FieldJobs, type FieldJobsOptions, type FieldTask, type TaskResult } from './fieldjobs';
import type { AnySource } from './fieldwork';

/** Bands of a finished field for each worker: small enough that a newer value never waits long for one. */
const BANDS_PER_WORKER = 4;
/** A rough field reads one cell in this many, each way. */
export const ROUGH_STEP = 4;

export function workerCount(): number {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2;
  return Math.min(4, Math.max(2, cores - 1));
}

export interface FieldWorkers {
  jobs: FieldJobs;
  /** The size of the grid of the photo open now. */
  setGrid(w: number, h: number): void;
  destroy(): void;
}

/** Null where the browser runs no workers. Then the page works the field out by itself. `most` caps the workers. */
export function createFieldJobs(o: Pick<FieldJobsOptions, 'show' | 'busy' | 'failed'>, most = 4): FieldWorkers | null {
  if (typeof Worker === 'undefined') return null;
  let gridW = 2;
  let gridH = 2;
  const count = Math.min(most, workerCount());
  const workers: Worker[] = [];
  const pending: (((answer: FieldAnswer) => void) | null)[] = [];
  let id = 0;
  try {
    for (let i = 0; i < count; i++) {
      const worker = new Worker(new URL('./field.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<FieldAnswer>) => {
        const resolve = pending[i];
        pending[i] = null;
        resolve?.(event.data);
      };
      worker.onerror = (event) => {
        event.preventDefault();
        const resolve = pending[i];
        pending[i] = null;
        resolve?.({ id: -1, kind: 'failed', message: event.message || 'worker' });
      };
      workers.push(worker);
      pending.push(null);
    }
  } catch {
    for (const w of workers) w.terminate();
    return null;
  }
  const run = (slot: number, job: number, source: AnySource, task: FieldTask): Promise<TaskResult> =>
    new Promise((resolve, reject) => {
      pending[slot] = (answer) => {
        if (answer.kind === 'failed') reject(new Error(answer.message));
        else resolve({ area: answer.area, band: answer.band });
      };
      const ask: FieldAsk = task.kind === 'rough' ? { id: ++id, job, kind: 'rough', source, w: gridW, h: gridH, step: task.step } : { id: ++id, job, kind: 'band', source, w: gridW, h: gridH, y0: task.y0, y1: task.y1 };
      workers[slot].postMessage(ask);
    });
  const jobs = new FieldJobs({ slots: count, bands: count * BANDS_PER_WORKER, step: ROUGH_STEP, run, ...o });
  return {
    jobs,
    setGrid(w, h) {
      gridW = w;
      gridH = h;
    },
    destroy() {
      jobs.cancel();
      for (const w of workers) w.terminate();
    },
  };
}
