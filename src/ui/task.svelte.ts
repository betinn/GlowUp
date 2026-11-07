import { StagedProgress, type Stage } from '../core/progress';

/** After this long the screen says that the wait is normal. */
const SLOW_AFTER = 7000;

/** Reactive view of a staged job, shared by the opening screen and the export sheet. */
export class Task {
  value = $state(0);
  label = $state('');
  detail = $state('');
  slow = $state(false);
  done = $state(false);
  /** Shown once the bar arrives at 100%, which can be just after the job ends. */
  doneLabel = $state('');

  private readonly steps: StagedProgress;
  private readonly started = performance.now();
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(stages: readonly Stage[]) {
    this.steps = new StagedProgress(stages);
    this.timer = setInterval(() => this.sync(), 80);
  }

  private sync(): void {
    const now = performance.now();
    this.value = this.steps.valueAt(now);
    this.slow = now - this.started > SLOW_AFTER;
  }

  stage(id: string, detail = ''): void {
    this.steps.enter(id, performance.now());
    this.label = this.steps.label;
    this.detail = detail;
    this.sync();
  }

  report(fraction: number, detail = ''): void {
    this.steps.report(fraction);
    this.detail = detail;
    this.sync();
  }

  finish(label: string): void {
    this.stop();
    this.steps.finish();
    this.doneLabel = label;
    this.detail = '';
    this.slow = false;
    this.value = 1;
    this.done = true;
  }

  stop(): void {
    clearInterval(this.timer);
  }
}
