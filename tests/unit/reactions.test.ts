import { describe, expect, it } from 'vitest';
import { World } from '../../src/world/World';
import { Mat } from '../../src/world/materials';
import { Reactions, ReactionStats } from '../../src/world/Reactions';

const STATS: ReactionStats = { resonanceDepth: 6, oreChance: 1, oreRadius: 2.5, oreDamage: 45 };

function setup(w: World, stats = STATS) {
  const r = new Reactions(w, stats);
  w.onHit = (x, y, m) => r.onHit(x, y, m);
  w.onDestroy = (x, y, m) => r.onDestroyed(x, y, m);
  return r;
}

describe('Resonance', () => {
  it('a hit consumes a connected crystal vein one BFS layer per tick', () => {
    const w = new World(64, 64, 1);
    for (let x = 10; x < 15; x++) w.setMat(x, 10, Mat.ResonanceCrystal);
    const r = setup(w);
    w.damage(10, 10, 1);
    r.update(); // depth 0
    expect(w.getMat(10, 10)).toBe(Mat.Air);
    expect(w.getMat(11, 10)).toBe(Mat.ResonanceCrystal);
    for (let i = 0; i < 10; i++) r.update();
    for (let x = 10; x < 15; x++) expect(w.getMat(x, 10)).toBe(Mat.Air);
    expect(r.resonated).toBe(5);
    expect(r.pending).toBe(0);
  });

  it('propagates even if the weapon destroyed the trigger cell itself', () => {
    const w = new World(64, 64, 1);
    w.setMat(5, 5, Mat.ResonanceCrystal);
    w.setMat(6, 5, Mat.ResonanceCrystal);
    const r = setup(w);
    w.damage(5, 5, 9999); // hit + destroy in one call
    for (let i = 0; i < 5; i++) r.update();
    expect(w.getMat(6, 5)).toBe(Mat.Air);
  });

  it('stops at the configured depth and never touches non-crystal cells', () => {
    const w = new World(64, 64, 1);
    for (let x = 0; x < 64; x++) w.setMat(x, 20, Mat.ResonanceCrystal);
    w.setMat(0, 21, Mat.Stone);
    const r = setup(w, { ...STATS, resonanceDepth: 4 });
    w.damage(0, 20, 1);
    for (let i = 0; i < 50; i++) r.update();
    expect(w.getMat(4, 20)).toBe(Mat.Air);
    expect(w.getMat(5, 20)).toBe(Mat.ResonanceCrystal);
    expect(w.getMat(0, 21)).toBe(Mat.Stone);
  });

  it('is bounded per tick on a huge vein and terminates', () => {
    const w = new World(256, 256, 1);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) w.setMat(x, y, Mat.ResonanceCrystal, false);
    const r = setup(w, { ...STATS, resonanceDepth: 10000 });
    w.damage(128, 128, 1);
    let ticks = 0;
    let maxPerTick = 0;
    while (r.pending > 0 && ticks < 10000) {
      const before = r.resonated;
      r.update();
      maxPerTick = Math.max(maxPerTick, r.resonated - before);
      ticks++;
    }
    expect(r.pending).toBe(0);
    expect(maxPerTick).toBeLessThanOrEqual(400);
    expect(r.resonated).toBe(256 * 256);
  });
});

describe('Unstable ore', () => {
  it('detonates when destroyed and chains through ore, bounded', () => {
    const w = new World(128, 64, 1);
    for (let x = 0; x < 128; x++) w.setMat(x, 30, Mat.UnstableOre);
    const r = setup(w);
    w.damage(0, 30, 9999);
    let ticks = 0;
    while (r.pending > 0 && ticks < 1000) { r.update(); ticks++; }
    expect(r.blasts).toBeGreaterThan(10);
    expect(w.getMat(127, 30)).toBe(Mat.Air);
    expect(r.pending).toBe(0);
  });

  it('does not detonate when chance is 0', () => {
    const w = new World(64, 64, 1);
    w.setMat(5, 5, Mat.UnstableOre);
    const r = setup(w, { ...STATS, oreChance: 0 });
    w.damage(5, 5, 9999);
    r.update();
    expect(r.blasts).toBe(0);
  });
});

describe('Glutstein', () => {
  it('sparks (queues a blast) more reliably than Unstable Ore', () => {
    const hits = (mat: Mat) => {
      const w = new World(64, 64, 1);
      const r = new Reactions(w, { resonanceDepth: 5, oreChance: 0.3, oreRadius: 3, oreDamage: 50 });
      let n = 0;
      for (let i = 0; i < 400; i++) {
        r.onDestroyed(10, 10, mat);
        n += r.pending;
        // drain
        for (let k = 0; k < 8; k++) r.update();
      }
      return n;
    };
    expect(hits(Mat.Glutstein)).toBeGreaterThan(hits(Mat.UnstableOre) * 1.3);
  });
});
