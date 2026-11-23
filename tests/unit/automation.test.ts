import { describe, expect, it } from 'vitest';
import { World } from '../../src/world/World';
import { Mat } from '../../src/world/materials';
import { findTarget, type TargetResult } from '../../src/automation/targeting';
import { Emitter } from '../../src/automation/Emitter';

function emptyWorld(size = 128): World {
  const w = new World(size, size, 1);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) w.setMat(x, y, Mat.Air);
  return w;
}
const out = (): TargetResult => ({ x: 0, y: 0, found: false });

describe('findTarget', () => {
  it('finds nothing in an empty world', () => {
    const w = emptyWorld();
    const o = out();
    expect(findTarget(w, 64.5, 64.5, 30, 32, false, o)).toBe(false);
    expect(o.found).toBe(false);
  });

  it('picks the nearest solid cell', () => {
    const w = emptyWorld();
    w.setMat(70, 64, Mat.Stone);
    w.setMat(64, 80, Mat.Stone);
    const o = out();
    expect(findTarget(w, 64.5, 64.5, 30, 32, false, o)).toBe(true);
    expect([o.x, o.y]).toEqual([70.5, 64.5]);
  });

  it('material-aware prefers a crystal over nearer stone', () => {
    const w = emptyWorld();
    w.setMat(68, 64, Mat.Stone);
    w.setMat(64, 74, Mat.ResonanceCrystal);
    const o = out();
    findTarget(w, 64.5, 64.5, 30, 32, true, o);
    expect([o.x, o.y]).toEqual([64.5, 74.5]);
  });

  it('respects range', () => {
    const w = emptyWorld();
    w.setMat(94, 64, Mat.Stone);
    const o = out();
    expect(findTarget(w, 64.5, 64.5, 20, 32, false, o)).toBe(false);
    expect(findTarget(w, 64.5, 64.5, 40, 32, false, o)).toBe(true);
  });
});

describe('Emitter', () => {
  it('destroys cells over time and retargets after the target dies', () => {
    const w = emptyWorld();
    w.setMat(70, 64, Mat.Stone);
    w.setMat(64, 58, Mat.Stone);
    const e = new Emitter(64.5, 64.5, { dps: 400, range: 30 });
    let steps = 0;
    while ((w.getMat(70, 64) !== Mat.Air || w.getMat(64, 58) !== Mat.Air) && steps < 600) {
      e.update(w, 1 / 60, false);
      steps++;
    }
    expect(w.getMat(70, 64)).toBe(Mat.Air);
    expect(w.getMat(64, 58)).toBe(Mat.Air);
    expect(steps).toBeLessThan(600);
    e.update(w, 1 / 60, false);
    expect(e.firing).toBe(false);
  });

  it('does bounded work per update on a 256x256 solid world', () => {
    const w = new World(256, 256, 7);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) w.setMat(x, y, Mat.Stone);
    let reads = 0;
    const orig = w.getMat.bind(w);
    w.getMat = (x: number, y: number) => (reads++, orig(x, y));
    const e = new Emitter(128.5, 128.5, { dps: 100, range: 40 });
    const t0 = performance.now();
    const n = 120;
    for (let i = 0; i < n; i++) e.update(w, 1 / 60, true);
    expect(performance.now() - t0).toBeLessThan(2000);
    // retarget cost + one laser pass per update, generous bound
    const perUpdate = 32 * (40 * 2 + 2) + 40 * 2 + 4;
    expect(reads).toBeLessThan(n * perUpdate);
  });
});
