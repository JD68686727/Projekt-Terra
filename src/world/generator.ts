import { World } from './World';
import { Mat } from './materials';
import { fbm, hash01, valueNoise } from './rng';

export interface GenOptions {
  /** Fraction of world height that is open sky above the surface. */
  skyFraction?: number;
}

/** Surface height (in cells) for column x. Deterministic per seed. */
export function surfaceY(x: number, world: World, skyFraction: number): number {
  const base = world.height * skyFraction;
  const n = fbm(x / 40, 0.5, world.seed ^ 0x5eed, 4);
  return Math.floor(base + (n - 0.5) * world.height * 0.18);
}

/**
 * Pure function of (seed, x, y) → material, so terrain can be rebuilt
 * from the seed and only modifications need saving.
 */
export function materialAt(x: number, y: number, world: World, surface: number): Mat {
  if (y < surface) return Mat.Air;
  const s = world.seed;
  const depth = (y - surface) / (world.height - surface); // 0 at surface, 1 at bottom

  // Caves: carved below a thin crust.
  if (y > surface + 6) {
    const cave = fbm(x / 22, y / 14, s ^ 0xca7e, 3);
    if (cave > 0.66 - depth * 0.04) return Mat.Air;
  }

  // Titanium bands deep down.
  if (depth > 0.55) {
    const band = valueNoise(x / 40, y / 6, s ^ 0x7171);
    if (band > 0.8) return Mat.TitaniumMatrix;
  }

  // Resonance crystal veins.
  const crystal = fbm(x / 10, y / 10, s ^ 0xc4157a1, 2);
  if (crystal > 0.8 - depth * 0.06) return Mat.ResonanceCrystal;

  // Unstable ore pockets.
  const ore = valueNoise(x / 7, y / 7, s ^ 0x0e0e);
  if (ore > 0.9 - depth * 0.06) return Mat.UnstableOre;

  // Stone → dense rock with depth, with noisy transition.
  const t = depth + (hash01(x, y, s ^ 0xd3) - 0.5) * 0.15 + (fbm(x / 30, y / 30, s ^ 0xde, 2) - 0.5) * 0.4;
  return t > 0.35 ? Mat.DenseRock : Mat.Stone;
}

export function generateWorld(world: World, opts: GenOptions = {}): void {
  const sky = opts.skyFraction ?? 0.2;
  for (let x = 0; x < world.width; x++) {
    const surf = surfaceY(x, world, sky);
    for (let y = 0; y < world.height; y++) {
      const m = materialAt(x, y, world, surf);
      if (m !== Mat.Air) world.setMat(x, y, m, false);
    }
  }
  world.markAllDirty();
}
