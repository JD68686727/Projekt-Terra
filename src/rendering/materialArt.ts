import { Mat } from '../world/materials';
import { hash01, valueNoise } from '../world/rng';

/**
 * Hand-tuned pixel-art look for every material. Each material has a
 * 5-step palette (0 = deepest shadow … 4 = highlight); pattern functions
 * pick a palette step per cell from world coordinates, so the look is
 * stable, seamless across chunks and costs no texture memory.
 */

type Palette = readonly [number, number, number, number, number];

export const PALETTES: Record<number, Palette> = {
  [Mat.Stone]: [0x24212f, 0x353244, 0x4a4659, 0x625d73, 0x857f97],
  [Mat.DenseRock]: [0x16151e, 0x201f2b, 0x2c2a3a, 0x3a374b, 0x504c63],
  [Mat.ResonanceCrystal]: [0x0a3a52, 0x11698a, 0x1ca6c6, 0x58e3f6, 0xd6ffff],
  [Mat.UnstableOre]: [0x2a1712, 0x43231a, 0xa8401a, 0xff8a2a, 0xffd37a],
  [Mat.TitaniumMatrix]: [0x2c3240, 0x48526a, 0x66748f, 0x93a4bd, 0xd2deec],
  [Mat.CoreMaterial]: [0x2c0740, 0x5a1080, 0x962cc8, 0xd277ff, 0xffd6ff],
};

/** Alien moss on sunlit surface cells. */
const MOSS: Palette = [0x123a33, 0x1c5a48, 0x2b8a62, 0x4fc382, 0x9df0b0];

// 4×4 ordered-dither matrix (0..15) for smooth pixel-art gradients.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function dither(gx: number, gy: number, v: number): number {
  // v in [0, 1) → step offset 0 or 1 based on the matrix threshold.
  return v * 16 > BAYER[((gy & 3) << 2) | (gx & 3)] ? 1 : 0;
}

export interface Neighbourhood {
  /** Air above / below / left / right. */
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  /** Air within 2-3 cells (cheap volume test). */
  nearAir: boolean;
  /** Cells below the local surface (for moss). */
  surfaceDepth: number;
}

/** Palette step 0..4 for a cell, before lighting. */
function patternStep(m: Mat, gx: number, gy: number, seed: number): number {
  switch (m) {
    case Mat.Stone: {
      // Sedimentary strata, gently warped, with dithered transitions and pebbles.
      const warp = valueNoise(gx / 22, gy / 22, seed ^ 0x51) * 6;
      const band = valueNoise(gx / 30, (gy + warp) / 3.2, seed ^ 0x52);
      let s = 1 + Math.floor(band * 2) + dither(gx, gy, (band * 2) % 1);
      const pebble = hash01(gx >> 1, gy >> 1, seed ^ 0x53);
      if (pebble > 0.93) s = 3 + (hash01(gx, gy, seed) > 0.5 ? 1 : 0);
      else if (pebble < 0.04) s = 0;
      return Math.min(3, s);
    }
    case Mat.DenseRock: {
      // Dark basalt with a network of fine cracks and sparse mineral flecks.
      const n = valueNoise(gx / 7, gy / 7, seed ^ 0x61);
      if (Math.abs(n - 0.5) < 0.035) return 0;
      const base = valueNoise(gx / 18, gy / 18, seed ^ 0x62);
      let s = 1 + dither(gx, gy, base);
      if (hash01(gx, gy, seed ^ 0x63) > 0.985) s = 3;
      return s;
    }
    case Mat.ResonanceCrystal: {
      // Facets: diagonal bands of shades, bright shine streaks along one diagonal.
      const facet = ((((gx + gy) >> 1) + Math.floor(hash01(gx >> 2, gy >> 2, seed ^ 0x71) * 5)) % 4) + 1;
      if ((gx - gy * 2 + 400000) % 9 === 0) return 4;
      return Math.min(3, facet);
    }
    case Mat.UnstableOre: {
      // Dark matrix with glowing embedded nuggets.
      const nug = hash01(gx >> 1, gy >> 1, seed ^ 0x81);
      if (nug > 0.55) return hash01(gx, gy, seed ^ 0x82) > 0.6 ? 4 : 3;
      if (nug > 0.45) return 2;
      return dither(gx, gy, valueNoise(gx / 5, gy / 5, seed ^ 0x83));
    }
    case Mat.TitaniumMatrix: {
      // Riveted armour plates 8×6, bevelled: light top/left edge, dark bottom/right edge.
      const px = ((gx % 8) + 8) % 8;
      const py = ((gy % 6) + 6) % 6;
      if (py === 5 || px === 7) return 0;
      if (py === 0 || px === 0) return 3;
      if ((px === 1 || px === 6) && (py === 1 || py === 4)) return 4; // rivets
      return 2 - dither(gx, gy, py / 6);
    }
    case Mat.CoreMaterial: {
      // Concentric energy rings broken by hash noise.
      const ring = Math.sin((gx * 0.9 + gy * 0.35) * 0.7 + valueNoise(gx / 6, gy / 6, seed ^ 0x91) * 6);
      return 1 + Math.floor((ring * 0.5 + 0.5) * 2.99);
    }
    default:
      return 2;
  }
}

/**
 * Final packed RGB for a solid cell. Lighting rules, in pixel-art fashion:
 * sunlit top edges +1 step (moss near the surface), undersides −1,
 * side edges keep a readable rim, and cells deep inside rock lose a step
 * (fake ambient occlusion) — except emissive materials.
 */
export function cellColor(m: Mat, gx: number, gy: number, seed: number, nb: Neighbourhood, emissive: boolean): number {
  let step = patternStep(m, gx, gy, seed);
  if (nb.up) {
    if (!emissive && nb.surfaceDepth < 4 && m !== Mat.TitaniumMatrix) {
      return MOSS[3 + (hash01(gx, gy, seed ^ 0x3a) > 0.7 ? 1 : 0)];
    }
    step = Math.min(4, step + 1);
  } else if (nb.down) {
    step = Math.max(0, step - 1);
  } else if (nb.left || nb.right) {
    step = Math.min(4, step + (m === Mat.TitaniumMatrix ? 0 : 1));
  } else if (!nb.nearAir && !emissive) {
    step = Math.max(0, step - 1);
  }
  // Moss creeping one cell under exposed surface tops.
  if (!emissive && nb.surfaceDepth >= 0 && nb.surfaceDepth < 2 && !nb.up && hash01(gx, gy, seed ^ 0x3b) > 0.55) {
    return MOSS[1 + (hash01(gx, gy, seed ^ 0x3c) > 0.5 ? 1 : 0)];
  }
  return PALETTES[m][step];
}

/** Darkens a packed colour toward black (cracks / damage). */
export function shade(rgb: number, k: number): number {
  const r = Math.min(255, ((rgb >> 16) & 0xff) * k);
  const g = Math.min(255, ((rgb >> 8) & 0xff) * k);
  const b = Math.min(255, (rgb & 0xff) * k);
  return (r << 16) | (g << 8) | b;
}
