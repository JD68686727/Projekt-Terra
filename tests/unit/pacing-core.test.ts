import { describe, expect, it } from 'vitest';
import { World } from '../../src/world/World';
import { coreShieldLookup, coreSites, countCoreCells, generateWorld, surfaceY } from '../../src/world/generator';
import { MATERIALS, Mat } from '../../src/world/materials';
import { Progression, RF_PER_RESONANCE } from '../../src/progression/Progression';
import { CuttingLaser } from '../../src/weapons/CuttingLaser';
import { PulseCannon } from '../../src/weapons/PulseCannon';
import { Reactions } from '../../src/world/Reactions';
import { Emitter } from '../../src/automation/Emitter';
import { UPGRADES } from '../../src/progression/upgrades';
import { DrillLauncher } from '../../src/weapons/DrillMissile';
import { FractureCharge } from '../../src/weapons/FractureCharge';

/**
 * Time-to-victory probe on the MVP world (1024², 1 core). A bot tunnels
 * toward the core using laser + pulse + emitters and buys the cheapest
 * affordable upgrade every 0.5 s. Uses only real game systems.
 */
function run(seed: number, maxSeconds: number, W = 1024, H = 1024, cores = 1) {
  const w = new World(W, H, seed);
  generateWorld(w, { cores });
  const sites = coreSites({ width: W, height: H, seed, cores });
  w.coreShield = coreShieldLookup(sites);
  let siteIdx = 0;
  let site = sites[0];
  let coreLeft = sites.reduce((n, c) => n + countCoreCells(w, c), 0);
  const coreTimes: number[] = [];
  let now = 0;
  const p = new Progression();
  const laser = new CuttingLaser(p.laserStats());
  const pulse = new PulseCannon(p.pulseStats());
  const drill = new DrillLauncher(p.drillStats());
  const frac = new FractureCharge(w, p.fractureStats());
  const r = new Reactions(w, p.reactionStats());
  const emitters: Emitter[] = [];
  r.events.onResonance = () => p.earnRf(RF_PER_RESONANCE);
  w.onHit = (x, y, m) => r.onHit(x, y, m);
  w.onDestroy = (x, y, m: Mat) => {
    p.earn(MATERIALS[m].value);
    r.onDestroyed(x, y, m);
    if (m === Mat.CoreMaterial) {
      coreLeft--;
      if (countCoreCells(w, site) === 0 && siteIdx < sites.length - 1) {
        coreTimes.push(now);
        site = sites[++siteIdx];
      }
    }
  };
  let x = W / 2 + 0.5;
  let y = surfaceY(Math.floor(x), w) - 3;
  const out = { endX: 0, endY: 0, hit: false };
  const dt = 1 / 60;
  let lastEmitterAt = -999;
  let aimX = site.x + 0.5;
  let aimY = site.y + 0.5;
  for (let i = 0; i < maxSeconds * 60; i++) {
    const t = i * dt;
    now = t;
    // Aim at the nearest remaining core cell (re-scanned every 0.5 s).
    if (i % 30 === 0) {
      let best = Infinity;
      const R = site.radius + 1;
      for (let yy = site.y - R; yy <= site.y + R; yy++)
        for (let xx = site.x - R; xx <= site.x + R; xx++)
          if (w.getMat(xx, yy) === Mat.CoreMaterial) {
            const dd = (xx - x) ** 2 + (yy - y) ** 2;
            if (dd < best) { best = dd; aimX = xx + 0.5; aimY = yy + 0.5; }
          }
      if (best === Infinity) { aimX = site.x + 0.5; aimY = site.y + 0.5; }
    }
    const dx = aimX - x;
    const dy = aimY - y;
    const d = Math.hypot(dx, dy) || 1;
    // Wide sweep: mines plenty of surrounding material for income, like a player would.
    const sweep = Math.sin(t * 1.3) * 35;
    laser.fire(w, x, y, x + (dx / d) * 40 - (dy / d) * sweep, y + (dy / d) * 40 + (dx / d) * sweep, dt, out);
    if (p.pulseUnlocked()) pulse.fire(w, x, y, aimX, aimY);
    pulse.update(w, dt);
    if (p.drillUnlocked()) drill.fire(x, y, aimX, aimY);
    drill.update(w, dt);
    if (p.fractureUnlocked()) frac.place(x, y, aimX, aimY);
    frac.update(dt);
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
        drill.stats = p.drillStats();
        frac.stats = p.fractureStats();
        r.stats = p.reactionStats();
        for (const e of emitters) e.setStats(p.emitterStats());
      }
    }
    if (coreLeft === 0) return { victory: t, coreTimes: [...coreTimes, t].map((v) => Math.round(v)), depth: site.y, mp: Math.round(p.totalMp) };
  }
  return { victory: Infinity, coreTimes, depth: site.y, mp: Math.round(p.totalMp), coreLeft, at: { x: Math.round(x), y: Math.round(y) }, dist: Math.round(Math.hypot(site.x - x, site.y - y)) };
}

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
