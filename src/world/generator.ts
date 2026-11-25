import { World } from './World';
import { Mat } from './materials';
import { fbm, hash01, valueNoise } from './rng';

export const SKY_FRACTION = 0.2;
/** Bump when terrain generation changes (stored in saves). */
export const GENERATOR_VERSION = 2;
/** Echo worlds (Echo ≥ 1) use biome ores; their saves are stamped with this version. */
export const GENERATOR_VERSION_BIOMES = 3;
export function generatorVersion(echo: number): number {
  return echo > 0 ? GENERATOR_VERSION_BIOMES : GENERATOR_VERSION;
}
/** Must match the number of render biomes (BIOMES in rendering/biome.ts). */
export const BIOME_COUNT = 5;

export interface WorldSpec {
  width: number;
  height: number;
  seed: number;
  /** Number of hidden resonance cores. */
  cores: number;
  /** Echo level (0 = original ores); selects the biome ore set. */
  echo?: number;
}

export interface CoreSite {
  x: number;
  y: number;
  /** Resonance shield: incoming damage on this core's material is divided by this. */
  shield: number;
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
 * Deterministic core placement. A single core sits deep (70–88 % of the solid
 * depth); with several cores they are staggered from shallow to deep so the
 * game has a progression of goals.
 */
export function coreSites(spec: WorldSpec): CoreSite[] {
  const { width, height, seed, cores } = spec;
  const out: CoreSite[] = [];
  const baseRadius = Math.max(4, Math.round(Math.min(width, height) / 160));
  const top = height * SKY_FRACTION;
  for (let i = 0; i < cores; i++) {
    // Deeper cores are larger with thicker shells: later goals stay meaningful.
    const radius = Math.round(baseRadius * Math.min(3.5, 1 + 0.9 * i));
    const shell = radius + 5 + 4 * Math.min(i, 4);
    const fx = 0.15 + 0.7 * hash01(i, 11, seed);
    const fy = cores === 1 ? 0.7 + 0.18 * hash01(i, 13, seed) : 0.3 + 0.58 * (i / (cores - 1)) + 0.04 * hash01(i, 13, seed);
    const x = Math.floor(width * fx);
    const y = Math.floor(top + (height - top) * fy);
    out.push({
      shield: CORE_SHIELDS[Math.min(i, CORE_SHIELDS.length - 1)] * (1 + SHIELD_PER_ECHO * (spec.echo ?? 0)),
      x: Math.min(width - shell - 5, Math.max(shell + 5, x)),
      y: Math.min(height - shell - 5, y),
      radius,
      shell,
    });
  }
  return out;
}

function baseMaterial(x: number, y: number, height: number, seed: number, surface: number, biome = 0): Mat {
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
  // Mineral veins: ridged noise (1 - |2n - 1|) traces thin, winding seams.
  // Domain-warped so veins meander; a second noise breaks them into
  // segments; veins thicken slightly with depth.
  const wx = x + (valueNoise(x / 23, y / 23, seed ^ 0x7a1) - 0.5) * 26;
  const wy = y + (valueNoise(x / 23, y / 23, seed ^ 0x7a2) - 0.5) * 26;
  const cv = 1 - Math.abs(fbm(wx / 34, wy / 26, seed ^ 0xc4157a1, 3) * 2 - 1);
  // Biome 1 (Rote Wüste): crystals are rarer. Biome 2 (Dschungel): crystal veins are Emerald Root, tougher rock. Biome 4 (Goldene Kruste): harder rock.
  const crystalCut = biome === 1 ? 0.992 : 0.985;
  if (cv > crystalCut - depth * 0.02 && valueNoise(x / 45, y / 45, seed ^ 0xc41) > 0.36) return biome === 2 ? Mat.Emerald : Mat.ResonanceCrystal;
  if (biome === 4) {
    const gv = 1 - Math.abs(fbm(wx / 24, wy / 30, seed ^ 0x601d, 2) * 2 - 1);
    if (gv > 0.978 - depth * 0.015 && valueNoise(x / 34, y / 34, seed ^ 0x6e1) > 0.4) return Mat.GoldVein;
  }
  const ov = 1 - Math.abs(fbm(wy / 20, wx / 28, seed ^ 0x0e0e, 2) * 2 - 1);
  // Biome 1 (Rote Wüste): Glutstein; biome 3 (Eiswelt): Frost Crystal; both replace Unstable Ore.
  const explosive = biome === 1 ? Mat.Glutstein : biome === 3 ? Mat.FrostCrystal : Mat.UnstableOre;
  if (ov > 0.984 - depth * 0.015 && valueNoise(x / 30, y / 30, seed ^ 0x0e1) > 0.42) return explosive;
  // Ore nodules strung along a few veins.
  if (ov > 0.93 && hash01(x >> 1, y >> 1, seed ^ 0x0e2) > 0.95) return explosive;
  const t = depth + (hash01(x, y, seed ^ 0xd3) - 0.5) * 0.15 + (fbm(x / 30, y / 30, seed ^ 0xde, 2) - 0.5) * 0.4;
  return t > (biome === 4 ? 0.18 : biome === 2 ? 0.28 : 0.35) ? Mat.DenseRock : Mat.Stone;
}

export interface VaultSite {
  /** Interior rectangle (air), walls are 2 cells of Titanium Matrix around it. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const VAULT_W = 14;
export const VAULT_H = 8;

/** Hidden vaults ("Geheimkammern"): deterministic, away from cores. */
export function vaultSites(spec: WorldSpec): VaultSite[] {
  const { width, height, seed } = spec;
  const count = Math.max(2, Math.min(8, Math.floor((width * height) / 400_000)));
  const cores = coreSites(spec);
  const top = height * SKY_FRACTION;
  const out: VaultSite[] = [];
  for (let i = 0, tries = 0; out.length < count && tries < count * 20; tries++, i++) {
    const x = Math.floor(8 + (width - VAULT_W - 16) * hash01(i, 21, seed));
    const y = Math.floor(top + 40 + (height - top - VAULT_H - 60) * hash01(i, 23, seed));
    const cx = x + VAULT_W / 2;
    const cy = y + VAULT_H / 2;
    if (cores.some((c) => Math.hypot(c.x - cx, c.y - cy) < c.shell + 30)) continue;
    if (out.some((v) => Math.abs(v.x0 - x) < VAULT_W * 3 && Math.abs(v.y0 - y) < VAULT_H * 4)) continue;
    out.push({ x0: x, y0: y, x1: x + VAULT_W - 1, y1: y + VAULT_H - 1 });
  }
  return out;
}

function stampVault(out: Uint8Array, width: number, v: VaultSite): void {
  for (let y = v.y0 - 2; y <= v.y1 + 2; y++) {
    for (let x = v.x0 - 2; x <= v.x1 + 2; x++) {
      const inside = x >= v.x0 && x <= v.x1 && y >= v.y0 && y <= v.y1;
      const i = y * width + x;
      if (!inside) out[i] = Mat.TitaniumMatrix;
      // Crystal treasure on the floor, air above it.
      else out[i] = y >= v.y1 - 2 && x > v.x0 + 2 && x < v.x1 - 2 ? Mat.ResonanceCrystal : Mat.Air;
    }
  }
}

/** Pure, worker-safe generation into a row-major material array. */
export function generateMaterials(spec: WorldSpec, onProgress?: (p: number) => void): Uint8Array {
  const { width, height } = spec;
  const seed = spec.seed >>> 0;
  const out = new Uint8Array(width * height);
  const biome = (spec.echo ?? 0) % BIOME_COUNT;
  for (let x = 0; x < width; x++) {
    const surf = surfaceAt(x, height, seed);
    for (let y = 0; y < height; y++) out[y * width + x] = baseMaterial(x, y, height, seed, surf, biome);
    if (onProgress && (x & 63) === 63) onProgress(x / width);
  }
  for (const v of vaultSites({ ...spec, seed })) stampVault(out, width, v);
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

/** Extra shield per Echo level (multiplier on top of the per-core shield). */
export const SHIELD_PER_ECHO = 0.5;

/** Damage divisor per core index (deeper cores are shielded harder). */
export const CORE_SHIELDS = [1, 3, 6, 10, 16, 26];

/**
 * Returns a lookup used by World.damage for Core Material cells: the shield
 * of the core containing (x, y), or 1.
 */
export function coreShieldLookup(sites: CoreSite[]): (x: number, y: number) => number {
  return (x, y) => {
    for (const c of sites) {
      const r = c.radius + 1;
      if (Math.abs(x - c.x) <= r && Math.abs(y - c.y) <= r) return c.shield;
    }
    return 1;
  };
}

export function countCoreCells(world: World, site: CoreSite): number {
  let n = 0;
  for (let y = site.y - site.radius; y <= site.y + site.radius; y++)
    for (let x = site.x - site.radius; x <= site.x + site.radius; x++) if (world.getMat(x, y) === Mat.CoreMaterial) n++;
  return n;
}

/** Synchronous generation (tests, fallback). */
export function generateWorld(world: World, opts: { cores?: number; echo?: number } = {}): void {
  world.loadMaterials(generateMaterials({ width: world.width, height: world.height, seed: world.seed, cores: opts.cores ?? 0, echo: opts.echo }));
}
