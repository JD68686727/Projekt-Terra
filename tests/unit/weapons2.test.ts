import { describe, expect, it } from 'vitest';
import { World } from '../../src/world/World';
import { Mat } from '../../src/world/materials';
import { DrillLauncher, type DrillStats } from '../../src/weapons/DrillMissile';
import { NanoSwarm } from '../../src/weapons/NanoSwarm';

const DT = 1 / 60;

function solidWorld(mat: Mat = Mat.Stone): World {
  const w = new World(128, 128, 1);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) w.setMat(x, y, mat);
  return w;
}
function carveAir(w: World, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) w.setMat(x, y, Mat.Air);
}
function digest(w: World): number {
  let h = 2166136261;
  for (const c of w.chunks) {
    for (let i = 0; i < c.mat.length; i++) h = Math.imul(h ^ c.mat[i], 16777619);
    for (let i = 0; i < c.hp.length; i++) h = Math.imul(h ^ c.hp[i], 16777619);
  }
  return h >>> 0;
}
const base: DrillStats = { speed: 60, power: 25, depth: 10, splits: 0, radius: 0, cooldown: 1, range: 40 };
function run(l: DrillLauncher, w: World, seconds: number): void {
  for (let i = 0; i < seconds * 60; i++) l.update(w, DT);
}
/** Solid cells destroyed along row y. */
function airRun(w: World, y: number, x0: number, x1: number): number {
  let n = 0;
  for (let x = x0; x <= x1; x++) if (w.getMat(x, y) === Mat.Air) n++;
  return n;
}

describe('DrillLauncher', () => {
  it('bores a tunnel of length ~depth in stone', () => {
    const w = solidWorld();
    carveAir(w, 0, 60, 9, 64);
    const l = new DrillLauncher({ ...base });
    let ended = 0;
    l.onEnd = () => ended++;
    expect(l.fire(5.5, 62.5, 100, 62.5)).toBe(true);
    run(l, w, 2);
    expect(airRun(w, 62, 10, 60)).toBe(10);
    expect(w.getMat(20, 62)).toBe(Mat.Stone);
    expect(ended).toBe(1);
    expect(l.missiles.length).toBe(0);
  });

  it('stops at a cell harder than its power', () => {
    const w = solidWorld();
    carveAir(w, 0, 60, 9, 64);
    w.setMat(15, 62, Mat.DenseRock);
    const l = new DrillLauncher({ ...base, depth: 30 });
    l.fire(5.5, 62.5, 100, 62.5);
    run(l, w, 2);
    expect(w.getMat(15, 62)).toBe(Mat.DenseRock);
    expect(airRun(w, 62, 10, 14)).toBe(5);
    expect(w.getMat(16, 62)).toBe(Mat.Stone);
    expect(l.missiles.length).toBe(0);
  });

  it('radius 1 makes a 3-wide tunnel', () => {
    const w = solidWorld();
    carveAir(w, 0, 58, 9, 66);
    const l = new DrillLauncher({ ...base, radius: 1 });
    l.fire(5.5, 62.5, 100, 62.5);
    run(l, w, 2);
    for (const y of [61, 62, 63]) expect(w.getMat(15, y)).toBe(Mat.Air);
    expect(w.getMat(15, 60)).toBe(Mat.Stone);
    expect(w.getMat(15, 64)).toBe(Mat.Stone);
  });

  it('splits create children; total bored stays bounded', () => {
    const w = solidWorld();
    carveAir(w, 0, 60, 9, 64);
    const l = new DrillLauncher({ ...base, depth: 16, splits: 2, range: 5 });
    const before = w.countSolid();
    let ends = 0;
    l.onEnd = () => ends++;
    l.fire(5.5, 62.5, 100, 62.5);
    let maxLive = 0;
    for (let i = 0; i < 240; i++) {
      l.update(w, DT);
      maxLive = Math.max(maxLive, l.missiles.length);
    }
    expect(maxLive).toBeGreaterThanOrEqual(2);
    expect(maxLive).toBeLessThanOrEqual(48);
    // gen0: 16, gen1: 2*8, gen2: 4*4 -> 48 bored cells max (plus cells hit by overlapping fans)
    const removed = before - w.countSolid();
    expect(removed).toBeGreaterThan(16);
    expect(removed).toBeLessThanOrEqual(16 + 2 * 8 + 4 * 4);
    expect(l.missiles.length).toBe(0);
    expect(ends).toBe(1 + 2 + 4);
  });

  it('respects cooldown', () => {
    const w = solidWorld();
    const l = new DrillLauncher({ ...base, cooldown: 0.5 });
    expect(l.fire(5, 5, 50, 5)).toBe(true);
    expect(l.ready).toBe(false);
    expect(l.fire(5, 5, 50, 5)).toBe(false);
    run(l, w, 0.6);
    expect(l.ready).toBe(true);
    expect(l.fire(5, 5, 50, 5)).toBe(true);
  });

  it('fizzles after range in air', () => {
    const w = new World(128, 128, 1);
    const l = new DrillLauncher({ ...base, range: 20 });
    let end: [number, number] | null = null;
    l.onEnd = (x, y) => (end = [x, y]);
    l.fire(10, 60, 200, 60);
    run(l, w, 1);
    expect(l.missiles.length).toBe(0);
    expect(end).not.toBeNull();
    expect(end![0]).toBeGreaterThan(29.5);
    expect(end![0]).toBeLessThan(31);
  });
});

describe('NanoSwarm', () => {
  function block(): World {
    const w = new World(128, 128, 1);
    for (let y = 60; y < 70; y++) for (let x = 60; x < 70; x++) w.setMat(x, y, Mat.Stone);
    return w;
  }

  it('mines out a small stone block inside leash', () => {
    const w = block();
    const s = new NanoSwarm({ count: 16, dps: 20, leash: 12, speed: 20 });
    s.deploy(65, 65);
    for (let i = 0; i < 60 * 30 && w.countSolid() > 0; i++) s.update(w, DT);
    expect(w.countSolid()).toBe(0);
  });

  it('never damages cells outside leash', () => {
    const w = block();
    const s = new NanoSwarm({ count: 16, dps: 40, leash: 4, speed: 20 });
    s.deploy(65, 65);
    for (let i = 0; i < 60 * 20; i++) s.update(w, DT);
    for (let y = 60; y < 70; y++) {
      for (let x = 60; x < 70; x++) {
        const d = Math.hypot(x + 0.5 - 65, y + 0.5 - 65);
        if (d > 4) expect(w.getMat(x, y)).toBe(Mat.Stone);
        if (d > 4) expect(w.getHp(x, y)).toBe(20);
      }
    }
    expect(w.countSolid()).toBeLessThan(100);
  });

  it('is deterministic', () => {
    const run1 = (): number => {
      const w = block();
      const s = new NanoSwarm({ count: 20, dps: 15, leash: 6, speed: 12 });
      s.deploy(64, 64);
      for (let i = 0; i < 300; i++) s.update(w, DT);
      return digest(w);
    };
    expect(run1()).toBe(run1());
  });

  it('bounds searches to 8 per update', () => {
    const w = block();
    const s = new NanoSwarm({ count: 64, dps: 10, leash: 12, speed: 10 });
    s.deploy(65, 65);
    let max = 0;
    for (let i = 0; i < 120; i++) {
      s.update(w, DT);
      max = Math.max(max, s.lastSearches);
    }
    expect(max).toBeGreaterThan(0);
    expect(max).toBeLessThanOrEqual(8);
  });

  it('clamps count to 64', () => {
    const w = block();
    const s = new NanoSwarm({ count: 500, dps: 10, leash: 12, speed: 10 });
    s.deploy(65, 65);
    s.update(w, DT);
    expect(s.x.length).toBe(64);
    expect(s.lastSearches).toBeLessThanOrEqual(8);
  });

  it('recall stops mining', () => {
    const w = block();
    const s = new NanoSwarm({ count: 16, dps: 20, leash: 12, speed: 20 });
    s.deploy(65, 65);
    for (let i = 0; i < 60; i++) s.update(w, DT);
    s.recall();
    const d = digest(w);
    for (let i = 0; i < 120; i++) s.update(w, DT);
    expect(digest(w)).toBe(d);
    expect(s.active).toBe(false);
  });
});
