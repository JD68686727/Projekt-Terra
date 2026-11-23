import { describe, expect, it } from 'vitest';
import { World } from '../../src/world/World';
import { coreSites, countCoreCells, generateWorld, surfaceY } from '../../src/world/generator';
import { MATERIALS, Mat } from '../../src/world/materials';
import { Progression } from '../../src/progression/Progression';
import { CuttingLaser } from '../../src/weapons/CuttingLaser';
import { PulseCannon } from '../../src/weapons/PulseCannon';
import { Reactions } from '../../src/world/Reactions';
import { Emitter } from '../../src/automation/Emitter';
import { UPGRADES } from '../../src/progression/upgrades';

/**
 * Time-to-victory probe on the MVP world (1024², 1 core). A bot tunnels
 * toward the core using laser + pulse + emitters and buys the cheapest
 * affordable upgrade every 0.5 s. Uses only real game systems.
 */
function run(seed: number, maxSeconds: number) {
  const W = 1024;
  const w = new World(W, W, seed);
  generateWorld(w, { cores: 1 });
  const site = coreSites({ width: W, height: W, seed, cores: 1 })[0];
  let coreLeft = countCoreCells(w, site);
  const p = new Progression();
  const laser = new CuttingLaser(p.laserStats());
  const pulse = new PulseCannon(p.pulseStats());
  const r = new Reactions(w, p.reactionStats());
  const emitters: Emitter[] = [];
  r.events.onResonance = () => p.earnRf(0.25);
  w.onHit = (x, y, m) => r.onHit(x, y, m);
  w.onDestroy = (x, y, m: Mat) => {
    p.earn(MATERIALS[m].value);
    r.onDestroyed(x, y, m);
    if (m === Mat.CoreMaterial) coreLeft--;
  };
  let x = W / 2 + 0.5;
  let y = surfaceY(Math.floor(x), w) - 3;
  const out = { endX: 0, endY: 0, hit: false };
  const dt = 1 / 60;
  let lastEmitterAt = -999;
  for (let i = 0; i < maxSeconds * 60; i++) {
    const t = i * dt;
    const dx = site.x + 0.5 - x;
    const dy = site.y + 0.5 - y;
    const d = Math.hypot(dx, dy) || 1;
    const sweep = Math.sin(t * 2) * 6;
    laser.fire(w, x, y, x + (dx / d) * 40 - (dy / d) * sweep, y + (dy / d) * 40 + (dx / d) * sweep, dt, out);
    if (p.pulseUnlocked()) pulse.fire(w, x, y, site.x, site.y);
    pulse.update(w, dt);
    for (const e of emitters) e.update(w, dt, p.materialAware());
    r.update();
    // Advance along the tunnel when the next cell is open.
    const nx = x + (dx / d) * 0.5;
    const ny = y + (dy / d) * 0.5;
    if (d > 3 && w.getMat(Math.floor(nx), Math.floor(ny)) === Mat.Air) {
      x += (dx / d) * p.droneSpeed() * dt;
      y += (dy / d) * p.droneSpeed() * dt;
    }
    if (p.maxEmitters() > emitters.length && t - lastEmitterAt > 20) {
      emitters.push(new Emitter(x, y, p.emitterStats()));
      lastEmitterAt = t;
    }
    if (i % 30 === 0) {
      const c = UPGRADES.filter((u) => p.check(u.id) === 'ok').sort((a, b) => p.cost(a.id) - p.cost(b.id))[0];
      if (c) {
        p.buy(c.id);
        laser.stats = p.laserStats();
        pulse.stats = p.pulseStats();
        r.stats = p.reactionStats();
        for (const e of emitters) e.setStats(p.emitterStats());
      }
    }
    if (coreLeft === 0) return { victory: t, depth: site.y, mp: p.totalMp };
  }
  return { victory: Infinity, depth: site.y, mp: p.totalMp, coreLeft, at: { x, y }, dist: Math.hypot(site.x - x, site.y - y) };
}

describe('MVP time to victory', () => {
  it('first core reachable in 8-45 minutes for a simple bot', () => {
    const res = run(1337, 45 * 60);
    console.log('victory probe', JSON.stringify(res));
    expect(res.victory).toBeGreaterThan(8 * 60);
    expect(res.victory).toBeLessThan(45 * 60);
  }, 300_000);
});
