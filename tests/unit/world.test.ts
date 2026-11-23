import { describe, expect, it } from 'vitest';
import { World, CHUNK_SIZE } from '../../src/world/World';
import { generateWorld } from '../../src/world/generator';
import { MATERIALS, Mat } from '../../src/world/materials';
import { hash2, fbm, mulberry32 } from '../../src/world/rng';

function digest(w: World): number {
  let h = 0;
  for (const c of w.chunks) for (let i = 0; i < c.mat.length; i++) h = (Math.imul(h, 31) + c.mat[i]) | 0;
  return h;
}

describe('rng', () => {
  it('is deterministic and seed-sensitive', () => {
    expect(hash2(3, 4, 1)).toBe(hash2(3, 4, 1));
    expect(hash2(3, 4, 1)).not.toBe(hash2(3, 4, 2));
    const a = mulberry32(9), b = mulberry32(9);
    for (let i = 0; i < 10; i++) expect(a()).toBe(b());
  });
  it('fbm stays in [0,1)', () => {
    for (let i = 0; i < 1000; i++) {
      const v = fbm(i * 0.37, i * 0.11, 5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('World', () => {
  it('rejects non-chunk-aligned sizes', () => {
    expect(() => new World(100, 64, 1)).toThrow();
  });

  it('stores materials and durability across chunk boundaries', () => {
    const w = new World(128, 128, 1);
    w.setMat(63, 64, Mat.Stone);
    w.setMat(64, 63, Mat.TitaniumMatrix);
    expect(w.getMat(63, 64)).toBe(Mat.Stone);
    expect(w.getHp(64, 63)).toBe(MATERIALS[Mat.TitaniumMatrix].durability);
    expect(w.getMat(-1, 0)).toBe(Mat.Air);
    expect(w.getMat(128, 0)).toBe(Mat.Air);
  });

  it('damages, destroys exactly once and reports value', () => {
    const w = new World(64, 64, 1);
    w.setMat(5, 5, Mat.Stone);
    const destroyed: Mat[] = [];
    w.onDestroy = (_x, _y, m) => destroyed.push(m);
    expect(w.damage(5, 5, 19)).toBe(Mat.Air);
    expect(w.getHp(5, 5)).toBe(1);
    expect(w.damage(5, 5, 100)).toBe(Mat.Stone);
    expect(w.getMat(5, 5)).toBe(Mat.Air);
    expect(w.damage(5, 5, 100)).toBe(Mat.Air);
    expect(destroyed).toEqual([Mat.Stone]);
  });

  it('tracks dirty chunks and row ranges including neighbours', () => {
    const w = new World(128, 128, 1);
    w.setMat(10, 63, Mat.Stone, false);
    w.takeDirty().forEach((c) => w.clearDirty(c));
    w.damage(10, 63, 999);
    const dirty = w.takeDirty();
    // Cell (10,63) is at the bottom of chunk (0,0); its lower neighbour is in chunk (0,1).
    expect(dirty.map((c) => `${c.cx},${c.cy}`).sort()).toEqual(['0,0', '0,1']);
    const top = dirty.find((c) => c.cy === 0)!;
    expect(top.dirtyY0).toBe(62);
    expect(top.dirtyY1).toBe(CHUNK_SIZE - 1);
    expect(top.modified).toBe(true);
    for (const c of dirty) w.clearDirty(c);
    expect(w.takeDirty()).toEqual([]);
  });
});

describe('generator', () => {
  it('is deterministic per seed', () => {
    const a = new World(256, 256, 42), b = new World(256, 256, 42), c = new World(256, 256, 43);
    generateWorld(a); generateWorld(b); generateWorld(c);
    expect(digest(a)).toBe(digest(b));
    expect(digest(a)).not.toBe(digest(c));
  });

  it('produces sky on top, solid ground and all early materials', () => {
    const w = new World(256, 256, 1337);
    generateWorld(w);
    for (let x = 0; x < 256; x += 16) expect(w.getMat(x, 2)).toBe(Mat.Air);
    const counts = new Array(MATERIALS.length).fill(0);
    for (const c of w.chunks) for (const m of c.mat) counts[m]++;
    const solid = 256 * 256 - counts[Mat.Air];
    expect(solid / (256 * 256)).toBeGreaterThan(0.45);
    expect(counts[Mat.Stone]).toBeGreaterThan(0);
    expect(counts[Mat.DenseRock]).toBeGreaterThan(0);
    expect(counts[Mat.ResonanceCrystal]).toBeGreaterThan(0);
    expect(counts[Mat.UnstableOre]).toBeGreaterThan(0);
    // Rare materials stay rare.
    expect(counts[Mat.ResonanceCrystal] / solid).toBeLessThan(0.12);
    // Generated terrain is not "modified" (seed reconstruction for saves).
    expect(w.chunks.every((c) => !c.modified)).toBe(true);
  });
});

describe('core shields', () => {
  it('divides damage on core material only, by the containing core shield', async () => {
    const { coreShieldLookup } = await import('../../src/world/generator');
    const w = new World(128, 128, 1);
    w.setMat(50, 50, Mat.CoreMaterial);
    w.setMat(10, 10, Mat.CoreMaterial);
    w.setMat(51, 50, Mat.Stone);
    w.coreShield = coreShieldLookup([{ x: 50, y: 50, radius: 3, shell: 6, shield: 4 }]);
    const full = MATERIALS[Mat.CoreMaterial].durability;
    w.damage(50, 50, 400);
    expect(full - w.getHp(50, 50)).toBe(100);
    w.damage(10, 10, 400); // outside any core site → unshielded
    expect(full - w.getHp(10, 10)).toBe(400);
    w.damage(51, 50, 5); // stone next to the core is unaffected
    expect(20 - w.getHp(51, 50)).toBe(5);
  });
});

describe('dirty requeue', () => {
  it('requeued chunks keep their row range and are returned again', () => {
    const w = new World(128, 128, 1);
    w.setMat(5, 7, Mat.Stone);
    w.setMat(70, 70, Mat.Stone);
    const d = w.takeDirty();
    expect(d.length).toBe(2);
    w.clearDirty(d[0]);
    w.requeueDirty(d);
    const again = w.takeDirty();
    expect(again.length).toBe(1);
    expect(again[0]).toBe(d[1]);
    expect(again[0].dirtyY0).toBe(70 & 63);
  });
});
