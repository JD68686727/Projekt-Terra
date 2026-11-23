import { World } from './World';
import { Mat } from './materials';
import { fbm, hash01, valueNoise } from './rng';

export const SKY_FRACTION = 0.2;

export interface WorldSpec {
  width: number;
  height: number;
  seed: number;
  /** Number of hidden resonance cores. */
  cores: number;
}

export interface CoreSite {
  x: number;
  y: number;
  /** Radius of the Core Material sphere. */
  radius: number;
  /** Outer radius of the Titanium Matrix shell. */
  shell: number;
}

/** Surface height (in cells) for column x. Deterministic per seed. */
export function surfaceAt(x: number, height: number, seed: number): number {
  const base = height * SKY_FRACTION;
  const n = fbm(x / 40, 0.5, (seed >>> 0) ^ 0x5eed, 4);
  return Math.floor(base + (n - 0.5) * Math.min(height, 512) * 0.18);
}

/** Convenience wrapper for code that has a World. */
export function surfaceY(x: number, world: World): number {
  return surfaceAt(x, world.height, world.seed);
}

/**
 * Deterministic core placement: one per horizontal slot, deep underground
 * (70–88 % of the solid depth), never overlapping.
 */
export function coreSites(spec: WorldSpec): CoreSite[] {
  const { width, height, seed, cores } = spec;
  const out: CoreSite[] = [];
  const radius = Math.max(4, Math.round(Math.min(width, height) / 160));
  const shell = radius + 3;
  const top = height * SKY_FRACTION;
  for (let i = 0; i < cores; i++) {
    const slotW = width / cores;
    const fx = 0.2 + 0.6 * hash01(i, 11, seed);
    const fy = 0.7 + 0.18 * hash01(i, 13, seed);
    const x = Math.floor(slotW * i + slotW * fx);
    const y = Math.floor(top + (height - top) * fy);
    out.push({
      x: Math.min(width - shell - 5, Math.max(shell + 5, x)),
      y: Math.min(height - shell - 5, y),
      radius,
      shell,
    });
  }
  return out;
}

function baseMaterial(x: number, y: number, height: number, seed: number, surface: number): Mat {
  if (y < surface) return Mat.Air;
  const depth = (y - surface) / (height - surface);
  if (y > surface + 6) {
    const cave = fbm(x / 22, y / 14, seed ^ 0xca7e, 3);
    if (cave > 0.66 - depth * 0.04) return Mat.Air;
  }
  if (depth > 0.55) {
    const band = valueNoise(x / 40, y / 6, seed ^ 0x7171);
    if (band > 0.8) return Mat.TitaniumMatrix;
  }
  const crystal = fbm(x / 10, y / 10, seed ^ 0xc4157a1, 2);
  if (crystal > 0.8 - depth * 0.06) return Mat.ResonanceCrystal;
  const ore = valueNoise(x / 7, y / 7, seed ^ 0x0e0e);
  if (ore > 0.9 - depth * 0.06) return Mat.UnstableOre;
  const t = depth + (hash01(x, y, seed ^ 0xd3) - 0.5) * 0.15 + (fbm(x / 30, y / 30, seed ^ 0xde, 2) - 0.5) * 0.4;
  return t > 0.35 ? Mat.DenseRock : Mat.Stone;
}

/** Pure, worker-safe generation into a row-major material array. */
export function generateMaterials(spec: WorldSpec, onProgress?: (p: number) => void): Uint8Array {
  const { width, height } = spec;
  const seed = spec.seed >>> 0;
  const out = new Uint8Array(width * height);
  for (let x = 0; x < width; x++) {
    const surf = surfaceAt(x, height, seed);
    for (let y = 0; y < height; y++) out[y * width + x] = baseMaterial(x, y, height, seed, surf);
    if (onProgress && (x & 63) === 63) onProgress(x / width);
  }
  for (const c of coreSites({ ...spec, seed })) stampCore(out, width, height, seed, c);
  return out;
}

/** Core Material sphere inside a titanium shell, wrapped in a crystal halo. */
function stampCore(out: Uint8Array, width: number, height: number, seed: number, c: CoreSite): void {
  const halo = c.shell + 3;
  for (let y = c.y - halo; y <= c.y + halo; y++) {
    for (let x = c.x - halo; x <= c.x + halo; x++) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const d = Math.hypot(x - c.x, y - c.y);
      const i = y * width + x;
      if (d <= c.radius) out[i] = Mat.CoreMaterial;
      else if (d <= c.shell) out[i] = Mat.TitaniumMatrix;
      else if (d <= halo && hash01(x, y, seed ^ 0xa10) < 0.55) out[i] = Mat.ResonanceCrystal;
    }
  }
}

export function countCoreCells(world: World, site: CoreSite): number {
  let n = 0;
  for (let y = site.y - site.radius; y <= site.y + site.radius; y++)
    for (let x = site.x - site.radius; x <= site.x + site.radius; x++) if (world.getMat(x, y) === Mat.CoreMaterial) n++;
  return n;
}

/** Synchronous generation (tests, fallback). */
export function generateWorld(world: World, opts: { cores?: number } = {}): void {
  world.loadMaterials(generateMaterials({ width: world.width, height: world.height, seed: world.seed, cores: opts.cores ?? 0 }));
}
