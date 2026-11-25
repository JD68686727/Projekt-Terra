import { describe, expect, it } from 'vitest';
import { run, EchoCarry } from '../helpers/pacing';
import { coreCountFor, worldHeightFor } from '../../src/config/meta';

/**
 * Echo campaign probe: one bot plays Echo 0..N back to back, spending the
 * Echo fragments it earns. SLOW (several real minutes) → only runs with
 * PACING_ECHO=<number of worlds>, e.g. `PACING_ECHO=3 npx vitest run tests/unit/pacing-echo.test.ts`.
 */
const env = (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env;
const worlds = Number(env?.PACING_ECHO ?? 0);

describe.skipIf(!worlds)('Echo campaign pacing', () => {
  it('each Echo world stays winnable and does not explode in length', () => {
    let carry: EchoCarry | undefined;
    const minutes: number[] = [];
    for (let e = 0; e < worlds; e++) {
      const res = run(1337, 150 * 60, 1024, worldHeightFor(e), coreCountFor(e), e, carry);
      console.log(`echo ${e}`, JSON.stringify({ min: Math.round(res.victory / 6) / 10, cores: res.coreTimes.map((t) => Math.round(t / 6) / 10), mp: res.mp, echoNext: res.carry?.echo }));
      expect(res.victory).toBeLessThan(150 * 60);
      minutes.push(res.victory / 60);
      carry = res.carry;
    }
    console.log('minutes per world', minutes.map((m) => Math.round(m)));
  }, 3_600_000);
});

describe('Echo campaign regression guard (3 worlds)', () => {
  it('Echo 0-2 stay within the intended time windows and get longer', () => {
    let carry: EchoCarry | undefined;
    const t: number[] = [];
    for (let e = 0; e < 3; e++) {
      const res = run(1337, 120 * 60, 1024, worldHeightFor(e), coreCountFor(e), e, carry);
      t.push(res.victory / 60);
      carry = res.carry;
    }
    console.log('guard minutes', t.map((m) => Math.round(m)));
    expect(t[0]).toBeGreaterThan(30);
    expect(t[0]).toBeLessThan(50);
    expect(t[1]).toBeGreaterThan(30);
    expect(t[1]).toBeLessThan(55);
    expect(t[2]).toBeGreaterThan(45);
    expect(t[2]).toBeLessThan(75);
    expect(t[2]).toBeGreaterThan(t[0] * 1.2);
  }, 300_000);
});
