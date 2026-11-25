import { describe, expect, it } from 'vitest';
import { traverseGrid } from '../../src/world/raycast';
import { World } from '../../src/world/World';
import { Mat } from '../../src/world/materials';
import { CuttingLaser } from '../../src/weapons/CuttingLaser';
import { FixedLoop } from '../../src/core/FixedLoop';

describe('traverseGrid', () => {
  it('visits contiguous cells along an axis', () => {
    const cells: string[] = [];
    traverseGrid(0.5, 0.5, 1, 0, 4, (x, y) => (cells.push(`${x},${y}`), true));
    expect(cells.slice(0, 5)).toEqual(['0,0', '1,0', '2,0', '3,0', '4,0']);
  });

  it('visits 4-connected cells on diagonals (no corner skipping)', () => {
    let px = 0, py = 0, first = true;
    traverseGrid(0.2, 0.7, 1, 1, 20, (x, y) => {
      if (!first) expect(Math.abs(x - px) + Math.abs(y - py)).toBe(1);
      first = false; px = x; py = y;
      return true;
    });
  });

  it('stops when the visitor returns false', () => {
    let n = 0;
    traverseGrid(0.5, 0.5, 1, 0.3, 100, () => ++n < 3);
    expect(n).toBe(3);
  });

  it('handles zero direction safely', () => {
    expect(traverseGrid(1, 1, 0, 0, 10, () => true)).toBe(0);
  });
});

describe('CuttingLaser', () => {
  it('damages only the first solid cell with pierce 1 and reports the hit', () => {
    const w = new World(64, 64, 1);
    for (let x = 10; x < 20; x++) w.setMat(x, 5, Mat.Stone);
    const laser = new CuttingLaser({ dps: 60, range: 50, width: 1, pierce: 1 });
    const out = { endX: 0, endY: 0, hit: false };
    laser.fire(w, 2.5, 5.5, 30.5, 5.5, 1 / 60, out);
    expect(out.hit).toBe(true);
    expect(out.endX).toBeCloseTo(10, 5);
    expect(w.getHp(10, 5)).toBe(19);
    expect(w.getHp(11, 5)).toBe(20);
  });

  it('cuts a tunnel over time and respects range', () => {
    const w = new World(64, 64, 1);
    for (let x = 0; x < 64; x++) w.setMat(x, 5, Mat.Stone);
    w.setMat(2, 5, Mat.Air);
    const laser = new CuttingLaser({ dps: 1200, range: 10, width: 1, pierce: 1 });
    const out = { endX: 0, endY: 0, hit: false };
    for (let i = 0; i < 600; i++) laser.fire(w, 2.5, 5.5, 60.5, 5.5, 1 / 60, out);
    // Cells within range destroyed, cells beyond untouched.
    expect(w.getMat(5, 5)).toBe(Mat.Air);
    expect(w.getMat(11, 5)).toBe(Mat.Air);
    expect(w.getMat(13, 5)).toBe(Mat.Stone);
    expect(w.getHp(13, 5)).toBe(20);
  });

  it('accumulates fractional damage', () => {
    const w = new World(64, 64, 1);
    w.setMat(5, 1, Mat.Stone);
    // 12 dps at 60 Hz = 0.2 damage per tick; after 1 s exactly 12 damage.
    const laser = new CuttingLaser({ dps: 12, range: 20, width: 1, pierce: 1 });
    const out = { endX: 0, endY: 0, hit: false };
    for (let i = 0; i < 60; i++) laser.fire(w, 0.5, 1.5, 9.5, 1.5, 1 / 60, out);
    expect(20 - w.getHp(5, 1)).toBeGreaterThanOrEqual(11);
    expect(20 - w.getHp(5, 1)).toBeLessThanOrEqual(12);
  });
});

describe('FixedLoop background catch-up', () => {
  it('maxDt lets a throttled background tick catch up more than 0.25 s', () => {
    const loop = new FixedLoop(60, 60);
    expect(loop.advance(1, () => {}, 1)).toBeGreaterThanOrEqual(59);
    const small = new FixedLoop(60, 60);
    expect(small.advance(1, () => {})).toBeLessThanOrEqual(15);
    small.reset();
    expect(small.advance(1, () => {})).toBeGreaterThanOrEqual(14);
  });
});

describe('FixedLoop', () => {
  it('runs fixed steps and bounds catch-up', () => {
    const loop = new FixedLoop(60, 5);
    let n = 0;
    expect(loop.advance(1 / 30 + 1e-9, () => n++)).toBe(2);
    expect(loop.advance(10, () => n++)).toBe(5);
    expect(loop.alpha).toBe(0);
  });
});
