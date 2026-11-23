import { describe, expect, it } from 'vitest';
import { FOG_CELL, FogMap, fogRleValid } from '../../src/world/FogMap';

describe('FogMap', () => {
  it('starts hidden, reveals a disc and reports dirty rows once', () => {
    const f = new FogMap(256, 256);
    expect(f.isRevealed(100, 100)).toBe(false);
    const n = f.reveal(100, 100, 20);
    expect(n).toBeGreaterThan(50);
    expect(f.isRevealed(100, 100)).toBe(true);
    expect(f.isRevealed(100, 140)).toBe(false);
    const rows = f.takeDirtyRows()!;
    expect(rows[0]).toBeLessThanOrEqual(Math.floor(100 / FOG_CELL));
    expect(f.takeDirtyRows()).toBeNull();
    expect(f.reveal(100, 100, 20)).toBe(0); // idempotent
  });

  it('reveals the open sky above the surface', () => {
    const f = new FogMap(128, 128);
    f.revealSky(() => 40, 4);
    expect(f.isRevealed(10, 20)).toBe(true);
    expect(f.isRevealed(10, 60)).toBe(false);
  });

  it('RLE round-trips and rejects wrong sizes', () => {
    const a = new FogMap(512, 256);
    a.reveal(50, 50, 30);
    a.reveal(400, 200, 12);
    const rle = a.encode();
    expect(rle.length).toBeLessThan(a.data.length / 10);
    const b = new FogMap(512, 256);
    expect(b.decode(rle)).toBe(true);
    expect(b.data).toEqual(a.data);
    const c = new FogMap(256, 256);
    expect(c.decode(rle)).toBe(false);
    expect(fogRleValid(Uint8Array.from([2, 5]), 5)).toBe(false);
    expect(fogRleValid(Uint8Array.from([1, 0]), 0)).toBe(false);
  });
});
