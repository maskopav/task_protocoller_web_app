import { describe, it, expect } from 'vitest';
import { createZeroRunTracker } from './zeroRunTracker';

const RATE = 48000;

// Low-level "room noise": never exactly zero.
const noise = (n) => Int16Array.from({ length: n }, (_, i) => (i % 2 ? 3 : -2));
const zeros = (n) => new Int16Array(n);
const concat = (...parts) => {
  const out = new Int16Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

describe('createZeroRunTracker', () => {
  it('reports a mid-recording run of zeros with its exact position and length', () => {
    const t = createZeroRunTracker();
    t.push(concat(noise(9600), zeros(1920), noise(4800)));

    expect(t.summary(RATE)).toEqual({
      count: 1,
      totalMs: 40,
      leadingMs: 0,
      trailingMs: 0,
      list: [{ atSec: 0.2, ms: 40, startSample: 9600, samples: 1920 }],
    });
  });

  it('tracks runs that span chunk boundaries', () => {
    const signal = concat(noise(5000), zeros(1920), noise(3000));
    const t = createZeroRunTracker();
    for (let i = 0; i < signal.length; i += 4096) t.push(signal.subarray(i, i + 4096));

    const s = t.summary(RATE);
    expect(s.count).toBe(1);
    expect(s.list[0]).toMatchObject({ startSample: 5000, samples: 1920 });
  });

  it('separates leading and trailing silence from gaps', () => {
    const t = createZeroRunTracker();
    t.push(concat(zeros(5760), noise(2000), zeros(480)));

    const s = t.summary(RATE);
    expect(s.count).toBe(0);
    expect(s.leadingMs).toBe(120);
    expect(s.trailingMs).toBe(10);
  });

  it('reports a recording with no audio at all as leading silence, not a gap', () => {
    const t = createZeroRunTracker();
    t.push(zeros(4800));

    expect(t.summary(RATE)).toMatchObject({ count: 0, leadingMs: 100, trailingMs: 0 });
  });

  it('ignores zero runs shorter than one render quantum', () => {
    const t = createZeroRunTracker();
    t.push(concat(noise(1000), zeros(127), noise(1000), zeros(128), noise(10)));

    const s = t.summary(RATE);
    expect(s.count).toBe(1);
    expect(s.list[0].samples).toBe(128);
  });

  it('counts every gap but lists only the first 20', () => {
    const parts = [noise(100)];
    for (let i = 0; i < 25; i++) parts.push(zeros(1920), noise(100));
    const t = createZeroRunTracker();
    t.push(concat(...parts));

    const s = t.summary(RATE);
    expect(s.count).toBe(25);
    expect(s.totalMs).toBe(1000);
    expect(s.list).toHaveLength(20);
  });
});
