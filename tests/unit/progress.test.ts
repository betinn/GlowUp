import { describe, expect, it } from 'vitest';
import { creep, StagedProgress, type Stage } from '../../src/core/progress';

const STAGES: Stage[] = [
  { id: 'read', label: 'Lendo', weight: 20 },
  { id: 'decode', label: 'Abrindo', weight: 60, estimate: 1000 },
  { id: 'render', label: 'Revelando', weight: 20 },
];

describe('StagedProgress', () => {
  it('starts at zero and maps real counts to the share of the stage', () => {
    const p = new StagedProgress(STAGES);
    expect(p.valueAt(0)).toBe(0);
    p.enter('read', 0);
    expect(p.label).toBe('Lendo');
    p.report(0.5);
    expect(p.valueAt(0)).toBeCloseTo(0.1);
  });

  it('puts the start of a stage exactly at the sum of the previous weights', () => {
    const p = new StagedProgress(STAGES);
    p.enter('render', 0);
    expect(p.valueAt(0)).toBeCloseTo(0.8);
  });

  it('never completes a stage on an estimate alone', () => {
    const p = new StagedProgress(STAGES);
    p.enter('decode', 0);
    const end = 0.8;
    expect(p.valueAt(1_000_000)).toBeLessThan(end);
    expect(p.valueAt(1000)).toBeGreaterThan(0.2);
  });

  it('never goes down', () => {
    const p = new StagedProgress(STAGES);
    p.enter('decode', 0);
    const high = p.valueAt(5000);
    p.report(0.01);
    expect(p.valueAt(0)).toBe(high);
    p.enter('read', 6000);
    expect(p.label).toBe('Abrindo');
    expect(p.valueAt(6000)).toBeGreaterThanOrEqual(high);
  });

  it('keeps the larger of the real count and the estimate', () => {
    const p = new StagedProgress(STAGES);
    p.enter('decode', 0);
    p.report(0.99);
    expect(p.valueAt(1)).toBeCloseTo(0.2 + 0.6 * 0.99);
  });

  it('reaches 100% only when finished', () => {
    const p = new StagedProgress(STAGES);
    p.enter('render', 0);
    p.report(1);
    expect(p.valueAt(0)).toBe(1);
    const q = new StagedProgress(STAGES);
    q.enter('decode', 0);
    q.finish();
    expect(q.valueAt(0)).toBe(1);
  });

  it('refuses a stage that does not exist', () => {
    expect(() => new StagedProgress(STAGES).enter('nope', 0)).toThrow('unknown stage');
  });
});

describe('creep', () => {
  it('rises fast at first and flattens below the limit', () => {
    expect(creep(0, 1000)).toBe(0);
    expect(creep(1000, 1000)).toBeGreaterThan(0.6);
    expect(creep(100_000, 1000)).toBeLessThan(0.93);
  });
});
