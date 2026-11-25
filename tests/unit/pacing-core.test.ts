import { describe, expect, it } from 'vitest';
import { run } from '../helpers/pacing';

describe('MVP time to victory', () => {
  it('first core reachable in 8-45 minutes for a simple bot', () => {
    const res = run(1337, 45 * 60);
    console.log('victory probe', JSON.stringify(res));
    expect(res.victory).toBeGreaterThan(8 * 60);
    expect(res.victory).toBeLessThan(45 * 60);
  }, 300_000);
});

describe('full game time to victory (1024×2048, 3 cores)', () => {
  it('all three cores in 35-60 minutes, each later core ≥ 8 minutes after the previous', () => {
    const res = run(1337, 75 * 60, 1024, 2048, 3);
    console.log('full probe', JSON.stringify(res));
    expect(res.victory).toBeGreaterThan(35 * 60);
    expect(res.victory).toBeLessThan(60 * 60);
    const t = res.coreTimes;
    expect(t.length).toBe(3);
    expect(t[1] - t[0]).toBeGreaterThan(8 * 60);
    expect(t[2] - t[1]).toBeGreaterThan(8 * 60);
  }, 600_000);
});
