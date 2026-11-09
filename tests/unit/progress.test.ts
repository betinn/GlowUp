import { describe, expect, it } from 'vitest';
import { creep, leftFrom, StagedProgress, timeLeft, type Stage } from '../../src/core/progress';
import { isPhone } from '../../src/ui/device';

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

describe('the time left', () => {
  it('is said in seconds up to a minute and a half, then in minutes, and never as zero', () => {
    expect(timeLeft(40)).toBe('cerca de 1 s');
    expect(timeLeft(8400)).toBe('cerca de 8 s');
    expect(timeLeft(89_000)).toBe('cerca de 89 s');
    expect(timeLeft(120_000)).toBe('cerca de 2 min');
  });

  it('comes from how fast the step went so far: a download at the speed it has had', () => {
    // A quarter done in 5 s leaves three times that.
    expect(leftFrom(5000, 0.25)).toBe('cerca de 15 s');
    // 10 MB of 40 MB in 30 s: a minute and a half to go.
    expect(leftFrom(30_000, 10 / 40)).toBe('cerca de 2 min');
  });

  it('says nothing while there is too little to go by, or when the step is over', () => {
    expect(leftFrom(200, 0.5)).toBe('');
    expect(leftFrom(5000, 0.01)).toBe('');
    expect(leftFrom(5000, 1)).toBe('');
  });
});

describe('a phone', () => {
  it('is told from a tablet and from a computer, by what the browser says of itself', () => {
    expect(isPhone('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')).toBe(true);
    expect(isPhone('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36')).toBe(true);
    expect(isPhone('Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0')).toBe(true);
    expect(isPhone('Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36')).toBe(false);
    expect(isPhone('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')).toBe(false);
    expect(isPhone('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36')).toBe(false);
  });

  it('believes the hint of the browser over its user agent', () => {
    expect(isPhone('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', true)).toBe(true);
    expect(isPhone('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36', false)).toBe(false);
  });
});
