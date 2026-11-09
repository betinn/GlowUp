import { describe, expect, it, vi } from 'vitest';
import { History } from '../../src/core/history/history';

const entry = (log: string[], name: string, bytes = 10) => ({
  label: name,
  bytes,
  undo: () => void log.push(`undo ${name}`),
  redo: () => void log.push(`redo ${name}`),
});

describe('history groups', () => {
  it('joins what was pushed into one step: undo backwards, redo forwards', async () => {
    const log: string[] = [];
    const h = new History();
    await h.group('look', async () => {
      h.push(entry(log, 'a', 3));
      await Promise.resolve();
      h.push(entry(log, 'b', 4));
    });
    expect(h.depth).toBe(1);
    expect(h.undoLabel).toBe('look');
    expect(h.memory).toBe(7);
    await h.undo();
    expect(h.canUndo).toBe(false);
    await h.redo();
    expect(log).toEqual(['undo b', 'undo a', 'redo a', 'redo b']);
  });

  it('adds no step when nothing was pushed', async () => {
    const h = new History();
    await h.group('look', () => {});
    expect(h.depth).toBe(0);
  });

  it('makes an undo wait for the group', async () => {
    const log: string[] = [];
    const h = new History();
    h.push(entry(log, 'before'));
    let finish = () => {};
    const group = h.group('look', () => new Promise<void>((done) => (finish = done)).then(() => h.push(entry(log, 'inside'))));
    const undo = h.undo();
    await new Promise((done) => setTimeout(done));
    expect(log).toEqual([]);
    finish();
    await Promise.all([group, undo]);
    expect(log).toEqual(['undo inside']);
    expect(h.undoLabel).toBe('before');
  });

  it('goes back to single steps after a failure, and keeps what was done', async () => {
    const log: string[] = [];
    const h = new History();
    await expect(
      h.group('look', () => {
        h.push(entry(log, 'a'));
        throw new Error('no');
      }),
    ).rejects.toThrow('no');
    expect(h.undoLabel).toBe('look');
    h.push(entry(log, 'b'));
    expect(h.depth).toBe(2);
    await h.undo();
    await h.undo();
    expect(log).toEqual(['undo b', 'undo a']);
  });

  it('runs a group inside a group as part of it', async () => {
    const log: string[] = [];
    const h = new History();
    await h.group('look', async () => {
      h.push(entry(log, 'a'));
      await h.group('inner', () => h.push(entry(log, 'b')));
    });
    expect(h.depth).toBe(1);
    expect(h.undoLabel).toBe('look');
  });

  it('forgets a group when the photo goes away during it', async () => {
    const log: string[] = [];
    const dispose = vi.fn();
    const h = new History();
    await h.group('look', () => {
      h.push({ ...entry(log, 'a'), dispose });
      h.clear();
    });
    expect(h.depth).toBe(0);
    expect(dispose).toHaveBeenCalled();
  });

  it('counts the growth of an entry only once', async () => {
    const log: string[] = [];
    const h = new History();
    const e = entry(log, 'a', 1);
    await h.group('look', () => {
      h.push(e);
      h.grow(e, 9);
    });
    expect(h.memory).toBe(10);
  });
});
