import { describe, expect, it, vi } from 'vitest';
import { History } from '../../src/core/history/history';

const entry = (log: string[], name: string, bytes = 10) => ({
  label: name,
  bytes,
  undo: () => void log.push(`undo ${name}`),
  redo: () => void log.push(`redo ${name}`),
});

describe('history', () => {
  it('undoes and redoes in order', async () => {
    const log: string[] = [];
    const h = new History();
    h.push(entry(log, 'a'));
    h.push(entry(log, 'b'));
    await h.undo();
    await h.undo();
    await h.undo();
    await h.redo();
    expect(log).toEqual(['undo b', 'undo a', 'redo a']);
    expect(h.canUndo).toBe(true);
    expect(h.canRedo).toBe(true);
  });

  it('clears the redo branch on a new entry', async () => {
    const log: string[] = [];
    const h = new History();
    const dispose = vi.fn();
    h.push({ ...entry(log, 'a'), dispose });
    await h.undo();
    h.push(entry(log, 'b'));
    expect(h.canRedo).toBe(false);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('serializes async undo steps', async () => {
    const log: string[] = [];
    const h = new History();
    const slow = (name: string) => ({
      label: name,
      bytes: 1,
      undo: async () => {
        log.push(`start ${name}`);
        await new Promise((r) => setTimeout(r, 5));
        log.push(`end ${name}`);
      },
      redo: () => {},
    });
    h.push(slow('a'));
    h.push(slow('b'));
    await Promise.all([h.undo(), h.undo()]);
    expect(log).toEqual(['start b', 'end b', 'start a', 'end a']);
  });

  it('drops the oldest entries only above the memory budget', () => {
    const log: string[] = [];
    const dispose = vi.fn();
    const h = new History(100);
    h.push({ ...entry(log, 'old', 60), dispose });
    h.push(entry(log, 'mid', 30));
    expect(h.depth).toBe(2);
    h.push(entry(log, 'new', 30));
    expect(h.depth).toBe(2);
    expect(dispose).toHaveBeenCalledOnce();
    expect(h.memory).toBe(60);
  });

  it('keeps many cheap entries without a depth limit', () => {
    const h = new History();
    for (let i = 0; i < 20000; i++) h.push(entry([], 'x', 200));
    expect(h.depth).toBe(20000);
  });
});
