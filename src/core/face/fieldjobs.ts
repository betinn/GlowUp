/**
 * Keeps the field of the face sliders up with a slider that moves faster than its field can be worked out.
 *
 * Each value asked for is a job. A job first reads the field roughly, which is quick and shows at once where the
 * face is going, then reads every cell in bands of rows, spread over the workers. A newer value takes the place
 * of an older one: the bands of the older job that have not started are dropped, and those still running are
 * not shown when they end. So the workers only ever work on the latest value, and what the photo shows only
 * moves forward. When the latest job ends with every cell read, the field is the finished one, the same as the
 * page would have worked out by itself.
 */

import { bandsOf, joinBands, type AnySource, type FieldBand, type FieldGrids, type GridArea } from './fieldwork';

export type FieldTask = { kind: 'rough'; step: number } | { kind: 'band'; y0: number; y1: number };

/** What a worker gives back: the area of the field, null when it moves nothing, and the rows it read. */
export interface TaskResult {
  area: GridArea | null;
  band: FieldBand | null;
}

/** Runs a task of a job on one of the slots. */
export type RunTask = (slot: number, job: number, source: AnySource, task: FieldTask) => Promise<TaskResult>;

/** A field to show. `grids` is null when the field moves nothing. `rough` while the finished field is on its way. */
export interface FieldFrame {
  job: number;
  grids: FieldGrids | null;
  rough: boolean;
}

export interface FieldJobsOptions {
  /** How many tasks may run at once: one a worker. */
  slots: number;
  /** About how many bands the rows of a finished field are cut into. */
  bands: number;
  /** A rough field reads one cell in this many, each way. */
  step: number;
  run: RunTask;
  show(frame: FieldFrame): void;
  /** The finished field of the latest value is on its way, or no longer. */
  busy?(busy: boolean): void;
  /** A worker failed: the source of the latest job, for the page to work out by itself. */
  failed?(source: AnySource, error: unknown): void;
}

interface Job {
  id: number;
  source: AnySource;
  area: GridArea | null;
  bands: FieldBand[];
  left: number;
}

export class FieldJobs {
  private seq = 0;
  /** The job whose finished field is wanted. Null when there is none to finish. */
  private latest: Job | null = null;
  /** The newest job any field was shown for. Results of older jobs are never shown. */
  private shown = 0;
  private queue: { job: Job; task: FieldTask }[] = [];
  private readonly free: number[];
  private waiting: (() => void)[] = [];
  /** Counts the tasks started, for tests. */
  started = 0;

  constructor(private readonly o: FieldJobsOptions) {
    this.free = Array.from({ length: Math.max(1, o.slots) }, (_, i) => i);
  }

  get busy(): boolean {
    return !!this.latest;
  }

  /** Resolves once the finished field of the latest value was shown, or it was cancelled. */
  idle(): Promise<void> {
    return this.latest ? new Promise((resolve) => this.waiting.push(resolve)) : Promise.resolve();
  }

  /** Asks for the field of a new value. What was asked before and has not started is dropped. */
  request(source: AnySource): void {
    const job: Job = { id: ++this.seq, source, area: null, bands: [], left: 0 };
    const was = !!this.latest;
    this.latest = job;
    this.queue = [{ job, task: { kind: 'rough', step: this.o.step } }];
    if (!was) this.o.busy?.(true);
    this.pump();
  }

  /** Drops every job: the field was set some other way. Nothing asked before is shown after this. */
  cancel(): void {
    this.queue = [];
    this.shown = this.seq;
    this.settle();
  }

  private settle(): void {
    if (!this.latest) return;
    this.latest = null;
    this.o.busy?.(false);
    const waiting = this.waiting;
    this.waiting = [];
    for (const resolve of waiting) resolve();
  }

  private pump(): void {
    while (this.free.length && this.queue.length) {
      const { job, task } = this.queue.shift()!;
      const slot = this.free.shift()!;
      this.started++;
      this.o.run(slot, job.id, job.source, task).then(
        (result) => {
          this.free.push(slot);
          this.done(job, task, result);
          this.pump();
        },
        (error: unknown) => {
          this.free.push(slot);
          if (job === this.latest) {
            this.queue = [];
            this.settle();
            this.o.failed?.(job.source, error);
          }
          this.pump();
        },
      );
    }
  }

  private showFrame(job: Job, grids: FieldGrids | null, rough: boolean): void {
    if (job.id < this.shown || (rough && job.id === this.shown)) return;
    this.shown = job.id;
    this.o.show({ job: job.id, grids, rough });
  }

  private done(job: Job, task: FieldTask, { area, band }: TaskResult): void {
    if (task.kind === 'rough') {
      const empty = !area || !band || area.x1 <= area.x0 || area.y1 <= area.y0;
      const grids = area && band ? { area, whole: band.whole, over: band.over, alone: band.alone } : null;
      if (job !== this.latest) {
        // Newer than what is on the photo, though the slider moved on: it still shows the way.
        if (!empty || !grids) this.showFrame(job, grids, true);
        return;
      }
      if (empty) {
        // Nothing to read cell by cell: this is the finished field.
        this.showFrame(job, grids, false);
        this.settle();
        return;
      }
      this.showFrame(job, grids, true);
      job.area = area;
      const rows = bandsOf(area!, this.o.bands);
      job.left = rows.length;
      for (const [y0, y1] of rows) this.queue.push({ job, task: { kind: 'band', y0, y1 } });
      return;
    }
    if (job !== this.latest || !band) return;
    job.bands.push(band);
    if (--job.left > 0) return;
    this.showFrame(job, joinBands(job.area!, job.bands), false);
    this.settle();
  }
}
