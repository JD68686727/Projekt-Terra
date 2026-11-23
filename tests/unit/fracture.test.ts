import { describe, expect, it } from 'vitest';
import { World } from '../../src/world/World';
import { Mat } from '../../src/world/materials';
import { FractureCharge, FractureStats } from '../../src/weapons/FractureCharge';

const S: FractureStats = { maxCells: 200, damage: 100, decay: 0.08, fuse: 0.5, cooldown: 1, range: 60 };

function solid(w: World, m: Mat = Mat.Stone, y0 = 20) {
  for (let y = y0; y < w.height; y++) for (let x = 0; x < w.width; x++) w.setMat(x, y, m);
}

describe('FractureCharge', () => {
  it('places on first solid cell, waits for the fuse, then fractures', () => {
    const w = new World(128, 128, 1);
    solid(w);
    const f = new FractureCharge(w, S);
    const c = f.place(64.5, 5.5, 64.5, 100)!;
    expect(c.y).toBe(20);
    f.update(0.25);
    expect(f.processed).toBe(0);
    for (let i = 0; i < 120; i++) f.update(1 / 60);
    expect(f.processed).toBeGreaterThan(50);
    expect(w.getMat(64, 20)).toBe(Mat.Air);
  });

  it('never exceeds maxCells per detonation nor the per-tick budget, and terminates', () => {
    const w = new World(256, 256, 1);
    solid(w, Mat.ResonanceCrystal, 0); // crystal = low decay → would spread far
    const f = new FractureCharge(w, { ...S, maxCells: 5000, decay: 0.01, fuse: 0 });
    f.place(128.5, -5, 128.5, 200);
    let ticks = 0;
    let maxStep = 0;
    while ((f.active || ticks === 0) && ticks < 1000) {
      const b = f.processed;
      f.update(1 / 60);
      maxStep = Math.max(maxStep, f.processed - b);
      ticks++;
    }
    expect(f.active).toBe(false);
    expect(f.processed).toBeLessThanOrEqual(5000);
    expect(maxStep).toBeLessThanOrEqual(350);
  });

  it('crystal conducts the fracture much further than rock', () => {
    const reach = (m: Mat) => {
      const w = new World(256, 64, 1);
      for (let x = 0; x < 256; x++) w.setMat(x, 30, m);
      const f = new FractureCharge(w, { ...S, maxCells: 1000, damage: 1, fuse: 0 });
      let maxX = 0;
      f.onFront = (x) => (maxX = Math.max(maxX, x));
      f.place(0.5, 25.5, 0.5, 40);
      for (let i = 0; i < 200; i++) f.update(1 / 60);
      return maxX;
    };
    expect(reach(Mat.ResonanceCrystal)).toBeGreaterThan(reach(Mat.Stone) * 3);
  });

  it('respects cooldown and max charges', () => {
    const w = new World(64, 64, 1);
    solid(w);
    const f = new FractureCharge(w, S);
    expect(f.place(10.5, 5.5, 10.5, 40)).not.toBeNull();
    expect(f.place(20.5, 5.5, 20.5, 40)).toBeNull();
  });
});
