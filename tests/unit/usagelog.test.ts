import { describe, expect, it } from 'vitest';
import { stopUsageLog } from '../../src/core/face/usagelog';

/** A task as MediaPipe builds it: the log under a short name, with a sender that posts on a timer. */
function task() {
  const sent: string[] = [];
  let timer: number | undefined = 1;
  const sender = {
    queue: ['started'],
    flush() {
      if (this.queue.length) sent.push(...this.queue.splice(0));
    },
    close() {
      timer = undefined;
      this.flush();
    },
  };
  const made = { h: { graph: true }, o: { m: sender, started: 0 } as { m: typeof sender } | undefined, delegate: 'CPU' };
  return { made, sender, sent, timer: () => timer };
}

describe('usage log of MediaPipe', () => {
  it('stops the timer, sends nothing and takes the log off the task', () => {
    const { made, sender, sent, timer } = task();
    expect(stopUsageLog(made)).toBe(made);
    expect(timer()).toBeUndefined();
    expect(sent).toEqual([]);
    expect(made.o).toBeUndefined();
    // Nothing goes out later either, should something still hold the sender.
    sender.flush();
    sender.close();
    expect(sent).toEqual([]);
  });

  it('leaves the rest of the task as it was', () => {
    const { made } = task();
    stopUsageLog(made);
    expect(made.h).toEqual({ graph: true });
    expect(made.delegate).toBe('CPU');
  });

  it('gives back a task with no log untouched', () => {
    const plain = { h: { close() {} }, name: 'x', none: null };
    expect(stopUsageLog(plain)).toEqual({ h: plain.h, name: 'x', none: null });
  });
});
