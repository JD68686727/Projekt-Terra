import { describe, expect, it } from 'vitest';
import { World } from '../../src/world/World';
import { generateWorld, surfaceY } from '../../src/world/generator';
import { MATERIALS, Mat } from '../../src/world/materials';
import { Progression } from '../../src/progression/Progression';
import { CuttingLaser } from '../../src/weapons/CuttingLaser';
import { UPGRADES } from '../../src/progression/upgrades';
import { Reactions } from '../../src/world/Reactions';

/**
 * Pacing probe: a simple bot digs downward with the laser (sweeping its aim)
 * and greedily buys the cheapest affordable upgrade. Real players aim better,
 * so these bounds are conservative.
 */
function simulate(seconds: number) {
  const w = new World(256, 256, 1337);
  generateWorld(w);
  const p = new Progression();
  const laser = new CuttingLaser(p.laserStats());
  const r = new Reactions(w, p.reactionStats());
  r.events.onResonance = () => p.earnRf(0.25);
  w.onHit = (x, y, m) => r.onHit(x, y, m);
  w.onDestroy = (x, y, m: Mat) => {
    p.earn(MATERIALS[m].value);
    r.onDestroyed(x, y, m);
  };
  let x = 128.5;
  let y = surfaceY(128, w) - 4;
  const out = { endX: 0, endY: 0, hit: false };
  const timeline: { t: number; id: string }[] = [];
  const dt = 1 / 60;
  for (let i = 0; i < seconds * 60; i++) {
    const t = i * dt;
    // Roam horizontally like a player looking for fresh material.
    x = 128.5 + Math.sin(t * 0.06) * 100;
    const sweep = Math.sin(t * 1.3) * 40;
    laser.fire(w, x, y, x + sweep, y + 60, dt, out);
    r.update();
    // Descend through the shaft as it opens.
    if (w.getMat(Math.floor(x), Math.floor(y + 2)) === Mat.Air && y < 240) y += 0.2;
    if (i % 30 === 0) {
      const cheapest = UPGRADES.filter((u) => p.check(u.id) === 'ok').sort((a, b) => p.cost(a.id) - p.cost(b.id))[0];
      if (cheapest) {
        p.buy(cheapest.id);
        laser.stats = p.laserStats();
        r.stats = p.reactionStats();
        timeline.push({ t, id: cheapest.id });
      }
    }
  }
  return { p, timeline };
}

describe('early-game pacing', () => {
  const { p, timeline } = simulate(300);
  const unlockAt = timeline.find((e) => e.id === 'pulseUnlock')?.t ?? Infinity;

  it('first upgrade arrives after 5-20 s', () => {
    expect(timeline[0]?.t ?? Infinity).toBeGreaterThan(5);
    expect(timeline[0]?.t ?? Infinity).toBeLessThan(20);
  });

  it('4-20 upgrades in the first 2 minutes', () => {
    const n = timeline.filter((e) => e.t < 120).length;
    expect(n).toBeGreaterThanOrEqual(4);
    expect(n).toBeLessThanOrEqual(20);
  });

  it('pulse cannon unlocks between 1.5 and 5 minutes', () => {
    expect(unlockAt).toBeGreaterThan(90);
    expect(unlockAt).toBeLessThan(300);
  });

  it('auto-targeting (first RF unlock) between 1.5 and 5 minutes', () => {
    const t = timeline.find((e) => e.id === 'autoTarget')?.t ?? Infinity;
    expect(t).toBeGreaterThan(90);
    expect(t).toBeLessThan(300);
  });

  it('emitter not before 2.5 minutes', () => {
    const t = timeline.find((e) => e.id === 'emitterUnlock')?.t ?? Infinity;
    expect(t).toBeGreaterThan(150);
  });

  it('logs the timeline', () => {
    console.log(timeline.map((e) => `${e.t.toFixed(0)}s ${e.id}`).join(', '), '| MP total', Math.round(p.totalMp), '| RF total', Math.round(p.totalRf));
    expect(timeline.length).toBeGreaterThan(0);
  });
});
