/**
 * Turns off the usage log of MediaPipe. No browser APIs and no library here, so it can be tested alone.
 *
 * MediaPipe counts each task it starts and how long each run takes, and once a minute tries to post the
 * counts to `https://odml.pa.googleapis.com/v1/log`, with the kind of task, the system and the version of
 * the library. No photo goes in them, but nothing leaves this app, and the library has no option for it.
 * The policy of the site already blocks the post; this stops the attempt.
 */

/** The part of a task that sends its counts: it sends with `flush`, and `close` stops its timer and sends. */
interface UsageSender {
  flush(): void;
  close(): void;
}

const isSender = (part: unknown): part is UsageSender =>
  !!part && typeof (part as UsageSender).flush === 'function' && typeof (part as UsageSender).close === 'function';

/**
 * The log hangs on the task under a name the library shortens, so it is found by its shape: an object of
 * the task that holds a sender. The sender is emptied, its timer stops, and the task goes on without the
 * log, which the library allows for. A task with no log comes back as it is.
 */
export function stopUsageLog<T extends object>(task: T): T {
  const fields = task as Record<string, unknown>;
  for (const [name, log] of Object.entries(fields)) {
    if (!log || typeof log !== 'object') continue;
    const sender = Object.values(log).find(isSender);
    if (!sender) continue;
    sender.flush = () => undefined;
    sender.close();
    fields[name] = undefined;
  }
  return task;
}
