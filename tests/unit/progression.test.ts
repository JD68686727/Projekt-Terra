import { describe, expect, it } from 'vitest';
import { Progression } from '../../src/progression/Progression';
import { UPGRADES, upgradeCost } from '../../src/progression/upgrades';
import { CORE_COUNT, MAX_CORES, MAX_WORLD_HEIGHT, DEFAULT_WORLD_HEIGHT, coreCountFor, worldHeightFor } from '../../src/config/meta';
import { PulseCannon } from '../../src/weapons/PulseCannon';
import { World } from '../../src/world/World';
import { MATERIALS, Mat } from '../../src/world/materials';

describe('upgrades', () => {
  it('costs grow monotonically and stay finite at max level', () => {
    for (const u of UPGRADES) {
      let prev = 0;
      for (let l = 0; l < u.maxLevel; l++) {
        const c = upgradeCost(u, l);
        expect(Number.isFinite(c)).toBe(true);
        expect(c).toBeGreaterThanOrEqual(prev);
        prev = c;
      }
    }
  });
});

describe('Progression', () => {
  it('applies MP multiplier on earn and tracks totals', () => {
    const p = new Progression();
    expect(p.earn(10)).toBe(10);
    p.mp = 1000;
    p.buy('mpMultiplier');
    expect(p.earn(10)).toBeCloseTo(12.5);
    expect(p.totalMp).toBeCloseTo(22.5);
  });

  it('enforces cost, prerequisites and max level', () => {
    const p = new Progression();
    expect(p.buy('laserDamage')).toBe('insufficient');
    expect(p.mp).toBe(0);
    p.mp = 1e9;
    expect(p.buy('pulseDamage')).toBe('locked');
    expect(p.buy('pulseUnlock')).toBe('ok');
    expect(p.buy('pulseUnlock')).toBe('maxed');
    expect(p.buy('pulseDamage')).toBe('ok');
    const before = p.mp;
    const cost = p.cost('laserWidth');
    expect(p.buy('laserWidth')).toBe('ok');
    expect(p.mp).toBe(before - cost);
  });

  it('derives stronger stats from upgrades', () => {
    const p = new Progression();
    const l0 = p.laserStats();
    p.levels.laserDamage = 3;
    p.levels.laserWidth = 2;
    const l1 = p.laserStats();
    expect(l1.dps).toBeCloseTo(l0.dps * Math.pow(1.3, 3), 5);
    expect(l1.width).toBe(3);
    p.levels.pulseCooldown = 4;
    expect(p.pulseStats().cooldown).toBeLessThan(1);
  });

  it('notifies on change', () => {
    const p = new Progression();
    let n = 0;
    p.onChange = () => n++;
    p.mp = 100;
    p.buy('laserDamage');
    expect(n).toBe(1);
  });
});

describe('PulseCannon', () => {
  function solidWorld(): World {
    const w = new World(64, 64, 1);
    for (let y = 20; y < 64; y++) for (let x = 0; x < 64; x++) w.setMat(x, y, Mat.Stone);
    return w;
  }

  it('detonates at the first solid cell, carves a crater and respects cooldown', () => {
    const w = solidWorld();
    const pc = new PulseCannon({ damage: 100, radius: 6, cooldown: 1, range: 50 });
    const wave = pc.fire(w, 32.5, 5.5, 32.5, 60)!;
    expect(wave).not.toBeNull();
    expect(wave.y).toBeCloseTo(20, 5);
    expect(pc.fire(w, 32.5, 5.5, 32.5, 60)).toBeNull();
    let destroyed = 0;
    w.onDestroy = () => destroyed++;
    for (let i = 0; i < 60; i++) pc.update(w, 1 / 60);
    expect(destroyed).toBeGreaterThan(30);
    expect(w.getMat(32, 22)).toBe(Mat.Air);
    // Outside the radius nothing is touched.
    expect(w.getHp(32, 30)).toBe(20);
    expect(pc.ready).toBe(true);
    for (let i = 0; i < 60; i++) pc.update(w, 1 / 60);
    expect(pc.waves.length).toBe(0);
  });

  it('hits each cell once per wave (annulus damage)', () => {
    const w = new World(64, 64, 1);
    w.setMat(34, 32, Mat.TitaniumMatrix);
    const pc = new PulseCannon({ damage: 50, radius: 8, cooldown: 0, range: 50 });
    pc.fire(w, 32.5, 32.5, 32.5, 32.5);
    for (let i = 0; i < 120; i++) pc.update(w, 1 / 60);
    const dealt = MATERIALS[Mat.TitaniumMatrix].durability - w.getHp(34, 32);
    expect(dealt).toBeGreaterThan(30);
    expect(dealt).toBeLessThanOrEqual(50);
  });
});

describe('Echo', () => {
  it('core count grows per Echo and is capped', () => {
    expect(coreCountFor(0)).toBe(CORE_COUNT);
    expect(coreCountFor(1)).toBe(CORE_COUNT + 1);
    expect(coreCountFor(99)).toBe(MAX_CORES);
  });
  it('Echo upgrades are bought with fragments and scale stats', () => {
    const p = new Progression();
    expect(p.buy('echoMp')).toBe('insufficient');
    p.echo = 10;
    expect(p.buy('echoMp')).toBe('ok');
    expect(p.echo).toBe(7);
    expect(p.mpMultiplier()).toBeCloseTo(1.2);
    p.levels.echoLaser = 5;
    expect(p.laserStats().dps).toBeCloseTo(160 * 2);
    p.levels.echoStart = 2;
    expect(p.echoStartMp()).toBe(6000);
    p.levels.echoRf = 4;
    p.earnRf(1);
    expect(p.rf).toBeCloseTo(2);
  });
  it('award scales with cores and prestige', () => {
    const p = new Progression();
    expect(p.echoAward(3)).toBe(6);
    p.prestige = 2;
    expect(p.echoAward(5)).toBe(12);
  });
  it('new Echo upgrades scale secondary weapons and emitter', () => {
    const p = new Progression();
    const d0 = p.pulseStats().damage;
    const e0 = p.emitterStats().dps;
    p.levels.echoBlast = 5;
    p.levels.echoEmitter = 2;
    expect(p.pulseStats().damage).toBeCloseTo(d0 * 2);
    expect(p.drillStats().power).toBeCloseTo(60 * 2);
    expect(p.emitterStats().dps).toBeCloseTo(e0 * 1.6);
  });
});

describe('world depth per Echo', () => {
  it('grows by 512 per Echo, is capped and stays a chunk multiple', () => {
    expect(worldHeightFor(0)).toBe(DEFAULT_WORLD_HEIGHT);
    expect(worldHeightFor(1)).toBe(DEFAULT_WORLD_HEIGHT + 512);
    expect(worldHeightFor(99)).toBe(MAX_WORLD_HEIGHT);
    for (let n = 0; n < 10; n++) expect(worldHeightFor(n) % 64).toBe(0);
  });
});
