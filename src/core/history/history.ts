/**
 * Undo stack with no fixed depth. Entries are small deltas: compressed mask tiles,
 * field tiles or document patches, never a copy of the image.
 * Undo and redo run one at a time so async entries cannot interleave.
 */

export interface HistoryEntry {
  label: string;
  /** Approximate memory held by this entry, in bytes. */
  bytes: number;
  undo(): void | Promise<void>;
  redo(): void | Promise<void>;
  /** Releases resources when the entry falls off the stack. */
  dispose?(): void;
}

/** Several entries as one: undo goes through them backwards, redo forwards. */
function joined(label: string, parts: readonly HistoryEntry[]): HistoryEntry {
  return {
    label,
    bytes: parts.reduce((n, part) => n + part.bytes, 0),
    undo: async () => {
      for (const part of [...parts].reverse()) await part.undo();
    },
    redo: async () => {
      for (const part of parts) await part.redo();
    },
    dispose: () => {
      for (const part of parts) part.dispose?.();
    },
  };
}

export class History {
  private readonly past: HistoryEntry[] = [];
  private readonly future: HistoryEntry[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  private bytes = 0;
  /** While a group runs, new entries wait here to become one step. */
  private gathering: HistoryEntry[] | null = null;

  /** Soft memory limit: above it the oldest entries are dropped. */
  constructor(
    private readonly budget = 768 * 1024 * 1024,
    private readonly onChange: () => void = () => {},
  ) {}

  get canUndo() {
    return this.past.length > 0;
  }

  get canRedo() {
    return this.future.length > 0;
  }

  get depth() {
    return this.past.length;
  }

  get memory() {
    return this.bytes;
  }

  get undoLabel() {
    return this.past.at(-1)?.label ?? null;
  }

  get redoLabel() {
    return this.future.at(-1)?.label ?? null;
  }

  push(entry: HistoryEntry): void {
    if (this.gathering) {
      this.gathering.push(entry);
      return;
    }
    for (const e of this.future.splice(0)) {
      this.bytes -= e.bytes;
      e.dispose?.();
    }
    this.past.push(entry);
    this.bytes += entry.bytes;
    while (this.bytes > this.budget && this.past.length > 1) {
      const old = this.past.shift()!;
      this.bytes -= old.bytes;
      old.dispose?.();
    }
    this.onChange();
  }

  /** Updates the size of the newest entry once its async payload arrives. */
  grow(entry: HistoryEntry, extra: number): void {
    entry.bytes += extra;
    if (!this.gathering?.includes(entry)) this.bytes += extra;
  }

  /**
   * Everything pushed while `run` works becomes one step, labelled `label`. Undo and redo wait for it. If
   * `run` fails, what it already did stays undoable, and the error goes on to the caller.
   */
  group(label: string, run: () => void | Promise<void>): Promise<void> {
    if (this.gathering) return Promise.resolve().then(run);
    return this.enqueue(async () => {
      const parts: HistoryEntry[] = [];
      this.gathering = parts;
      try {
        await run();
      } finally {
        // A clear in the meantime means the photo is gone, and these entries with it.
        if (this.gathering === parts) {
          this.gathering = null;
          if (parts.length) this.push(joined(label, parts));
        }
      }
    });
  }

  private enqueue(job: () => void | Promise<void>): Promise<void> {
    const next = this.queue.then(job, job).then(() => this.onChange());
    this.queue = next.catch(() => {});
    return next;
  }

  undo(): Promise<void> {
    return this.enqueue(async () => {
      const e = this.past.pop();
      if (!e) return;
      await e.undo();
      this.future.push(e);
    });
  }

  redo(): Promise<void> {
    return this.enqueue(async () => {
      const e = this.future.pop();
      if (!e) return;
      await e.redo();
      this.past.push(e);
    });
  }

  clear(): void {
    for (const e of [...this.past, ...this.future, ...(this.gathering ?? [])]) e.dispose?.();
    this.gathering = null;
    this.past.length = 0;
    this.future.length = 0;
    this.bytes = 0;
    this.onChange();
  }
}
