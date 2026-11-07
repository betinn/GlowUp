/**
 * Turns the stages of a long job into one percentage. Stage boundaries are real. Inside a stage the
 * value comes from real counts when there are any. Browsers report nothing while decoding or
 * encoding, so those stages creep toward their end on a time estimate and stop short of it: the bar
 * keeps moving, but only the real end of the stage completes it.
 */

export interface Stage {
  id: string;
  label: string;
  /** Share of the bar. Any positive scale works: weights are normalized. */
  weight: number;
  /** Usual duration in milliseconds, for stages that cannot report their own progress. */
  estimate?: number;
}

/** Highest fraction of a stage that an estimate alone can reach. */
const CREEP_LIMIT = 0.92;

export const creep = (elapsed: number, estimate: number) => CREEP_LIMIT * (1 - Math.exp((-1.6 * elapsed) / Math.max(estimate, 1)));

export class StagedProgress {
  private readonly starts: number[] = [];
  private readonly total: number;
  private index = -1;
  private enteredAt = 0;
  private reported = 0;
  private peak = 0;
  private finished = false;

  constructor(private readonly stages: readonly Stage[]) {
    let sum = 0;
    for (const s of stages) {
      this.starts.push(sum);
      sum += s.weight;
    }
    this.total = sum;
  }

  get label(): string {
    return this.stages[this.index]?.label ?? '';
  }

  /** Moves to a stage. Stages only go forward, and skipping one counts it as done. */
  enter(id: string, now: number): void {
    const next = this.stages.findIndex((s) => s.id === id);
    if (next < 0) throw new Error(`unknown stage: ${id}`);
    if (next <= this.index) return;
    this.index = next;
    this.enteredAt = now;
    this.reported = 0;
  }

  /** Real progress of the current stage, from 0 to 1. */
  report(fraction: number): void {
    this.reported = Math.min(1, Math.max(this.reported, fraction));
  }

  finish(): void {
    this.finished = true;
  }

  /** Overall value from 0 to 1. It never goes down. */
  valueAt(now: number): number {
    if (this.finished) return 1;
    const stage = this.stages[this.index];
    if (!stage) return 0;
    const guess = stage.estimate ? creep(now - this.enteredAt, stage.estimate) : 0;
    const inside = Math.max(this.reported, guess) * stage.weight;
    this.peak = Math.max(this.peak, (this.starts[this.index] + inside) / this.total);
    return this.peak;
  }
}

/**
 * Waits until the browser has had a chance to paint. Hidden tabs get no frames, so a timer backs it
 * up and work keeps going in the background.
 */
export function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    let frame = 0;
    const go = () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      setTimeout(resolve);
    };
    const timer = setTimeout(go, 120);
    frame = requestAnimationFrame(go);
  });
}
