import { describe, expect, it } from 'vitest';
import { BIOMES, DENSE_L, STONE_L, biomeFor, ramp, shiftPixels, shiftRgb } from '../../src/rendering/biome';
import { PALETTES, applyBiome } from '../../src/rendering/materialArt';
import { Mat } from '../../src/world/materials';

const lum = (c: number) => 0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255);

describe('biomes', () => {
  it('cycles through all biomes and Echo 0 is the original look', () => {
    expect(biomeFor(0)).toBe(BIOMES[0]);
    expect(biomeFor(BIOMES.length)).toBe(BIOMES[0]);
    expect(biomeFor(2).name).toBe(BIOMES[2].name);
    expect(BIOMES[0].stone).toBeNull();
    expect(new Set(BIOMES.map((b) => b.name)).size).toBe(BIOMES.length);
  });
  it('ramps get brighter step by step', () => {
    for (const b of BIOMES) {
      if (!b.stone) continue;
      for (const l of [STONE_L, DENSE_L]) {
        const r = ramp(b.stone.h, b.stone.s, l);
        for (let i = 1; i < r.length; i++) expect(lum(r[i])).toBeGreaterThan(lum(r[i - 1]));
      }
    }
  });
  it('hue shift: identity at 0/360°, keeps luminance, leaves transparent pixels alone', () => {
    expect(shiftRgb(0x5b2a7a, 0)).toBe(0x5b2a7a);
    const a = shiftRgb(0x5b2a7a, 360);
    expect(Math.abs(lum(a) - lum(0x5b2a7a))).toBeLessThan(2);
    expect(Math.abs(lum(shiftRgb(0x5b2a7a, 80)) - lum(0x5b2a7a))).toBeLessThan(6);
    const px = new Uint8Array([10, 200, 30, 0, 10, 200, 30, 255]);
    shiftPixels(px, 120);
    expect([px[0], px[1], px[2]]).toEqual([10, 200, 30]);
    expect([px[4], px[5], px[6]]).not.toEqual([10, 200, 30]);
  });
  it('applyBiome swaps stone palettes and restores the original for Echo 0', () => {
    const orig = PALETTES[Mat.Stone];
    applyBiome(BIOMES[1]);
    expect(PALETTES[Mat.Stone]).not.toBe(orig);
    applyBiome(BIOMES[0]);
    expect(PALETTES[Mat.Stone]).toBe(orig);
  });
});
