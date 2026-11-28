import { describe, expect, it } from 'vitest';
import { CoreBehavior, GAP_WIDTH, PULSE_OPEN, PULSE_PERIOD, coreModeFor } from '../../src/world/CoreBehavior';
import { Mat } from '../../src/world/materials';
import { World } from '../../src/world/World';

const site = { x: 32, y: 32, radius: 4, shell: 9, shield: 4 };

function setup(mode: number) {
  const w = new World(64, 64, 1);
  for (let y = 28; y <= 36; y++) for (let x = 28; x <= 36; x++) w.setMat(x, y, Mat.CoreMaterial);
  const total = 81;
  const state = [{ remaining: total, total }];
  const calls: string[] = [];
  const hooks = {
    event: (_i: number, k: string) => calls.push(k),
    regrown: () => {
      state[0].remaining++;
      calls.push('regrown');
    },
  };
  const b = new CoreBehavior([site], coreModeFor(mode), w);
  return { w, b, state, calls, hooks: hooks as never };
}

describe('core behaviours', () => {
  it('maps biomes to modes', () => {
    expect([0, 1, 2, 3, 4, 5].map(coreModeFor)).toEqual(['pulse', 'heat', 'regrow', 'phases', 'gap', 'pulse']);
  });

  it('pulse: open window 1.8x, closed 0.45x, average close to 1', () => {
    const { b, w, state, hooks } = setup(0);
    let sum = 0;
    let n = 0;
    let open = 0;
    for (let t = 0; t < PULSE_PERIOD * 4; t += 0.05) {
      b.update(0.05, w, state, hooks);
      sum += b.dyn[0].mult;
      n++;
      if (b.dyn[0].mult > 1) open++;
    }
    expect(sum / n).toBeGreaterThan(0.9);
    expect(sum / n).toBeLessThan(1.05);
    expect(open / n).toBeCloseTo(PULSE_OPEN / PULSE_PERIOD, 1);
  });

  it('heat: sustained fire vents (core shielded 3 s), pauses keep it cool', () => {
    const { b, w, state, calls, hooks } = setup(1);
    // Fire with pauses: never vents.
    for (let t = 0; t < 40; t += 0.05) {
      b.update(0.05, w, state, hooks);
      if (Math.floor(t * 2) % 4 === 0) b.damaged(0);
    }
    expect(calls).not.toContain('vent');
    // Constant fire: vents within ~7 s.
    for (let t = 0; t < 8; t += 0.05) {
      b.damaged(0);
      b.update(0.05, w, state, hooks);
    }
    expect(calls).toContain('vent');
    expect(b.dyn[0].mult).toBe(0.25);
  });

  it('regrow: restores missing cells only after 2 s without damage', () => {
    const { b, w, state, hooks } = setup(2);
    for (let x = 28; x <= 36; x++) w.setMat(x, 32, Mat.Air);
    state[0].remaining -= 9;
    b.damaged(0);
    for (let t = 0; t < 1.5; t += 0.05) b.update(0.05, w, state, hooks);
    expect(state[0].remaining).toBe(72);
    for (let t = 0; t < 4; t += 0.05) b.update(0.05, w, state, hooks);
    expect(state[0].remaining).toBeGreaterThan(72);
    expect(w.getMat(28, 32) === Mat.CoreMaterial || w.getMat(29, 32) === Mat.CoreMaterial).toBe(true);
  });

  it('phases: frost nova at 2/3 and 1/3 lock the core (1/6 damage) for 4 s', () => {
    const { b, w, state, calls, hooks } = setup(3);
    state[0].remaining = 50;
    b.update(0.05, w, state, hooks);
    expect(calls).toEqual(['nova']);
    expect(b.dyn[0].mult).toBeCloseTo(1 / 6);
    for (let t = 0; t < 4.2; t += 0.05) b.update(0.05, w, state, hooks);
    expect(b.dyn[0].mult).toBe(1);
    state[0].remaining = 20;
    b.update(0.05, w, state, hooks);
    expect(calls).toEqual(['nova', 'nova']);
  });

  it('gap: only the rotating arc is weak', () => {
    const { b } = setup(4);
    const d = b.dyn[0];
    d.gapAngle = 0;
    expect(b.multAt(0, 36, 32)).toBe(3); // east, inside the arc
    expect(b.multAt(0, 28, 32)).toBe(0.5); // west
    const half = GAP_WIDTH / 2;
    expect(b.multAt(0, 32 + Math.cos(half + 0.2) * 5, 32 + Math.sin(half + 0.2) * 5)).toBe(0.5);
  });
});
