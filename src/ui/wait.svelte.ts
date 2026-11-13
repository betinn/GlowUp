/**
 * What the photo is waiting for, in words, so the wait shows on the photo itself and not only in a panel. A tap
 * that changes the photo runs inside `during`, and the photo breaks into pieces until the result is on screen.
 */

import { nextPaint } from '../core/progress';

export interface Wait {
  id: number;
  /** What is being done, as the person reads it over the photo. */
  label: string;
}

export const waits = $state({ list: [] as Wait[] });

let last = 0;

/**
 * Runs a job with its wait over the photo. The wait is painted before the job starts, so a step that holds the
 * page still shows it, and it leaves one frame after the job ends, when the photo already shows the result.
 */
export async function during<T>(label: string, job: () => Promise<T> | T): Promise<T> {
  const id = ++last;
  waits.list.push({ id, label });
  try {
    await nextPaint();
    return await job();
  } finally {
    await nextPaint();
    const at = waits.list.findIndex((w) => w.id === id);
    if (at >= 0) waits.list.splice(at, 1);
  }
}
