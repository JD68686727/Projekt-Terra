import { Mat } from '../world/materials';
import { hash01, valueNoise } from '../world/rng';

/**
 * HD pixel art. Every terrain cell is drawn as D×D art pixels ("sub-pixels",
 * coordinates sx = gx·D + i). All functions are pure functions of world
 * coordinates, so the look is seamless across chunks and needs no stored
 * texture data. Palettes have 5 steps: 0 = deepest shadow … 4 = highlight.
 */

export type Palette = readonly [number, number, number, number, number];

export const PALETTES: Record<number, Palette> = {
  [Mat.Stone]: [0x221f2d, 0x332f42, 0x463f57, 0x5d5670, 0x7e7693],
  [Mat.DenseRock]: [0x14131c, 0x1d1c28, 0x292737, 0x363347, 0x4b475e],
  [Mat.ResonanceCrystal]: [0x0a3a52, 0x11698a, 0x1ca6c6, 0x58e3f6, 0xd6ffff],
  [Mat.UnstableOre]: [0x2a1712, 0x43231a, 0xa8401a, 0xff8a2a, 0xffd37a],
  [Mat.TitaniumMatrix]: [0x2a303e, 0x454f66, 0x63718c, 0x8fa0ba, 0xd2deec],
  [Mat.CoreMaterial]: [0x2c0740, 0x5a1080, 0x962cc8, 0xd277ff, 0xffd6ff],
};

export const MOSS: Palette = [0x0f332c, 0x1a5444, 0x27825c, 0x48bd7c, 0x9df0b0];
export const OUTLINE = 0x0b0a12;
const FUNGUS = [0x1b6a6a, 0x3ff0d0, 0xb8fff0];
const BACK: Palette = [0x09080e, 0x0f0e16, 0x15131e, 0x1b1927, 0x242132];

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function bayer(x: number, y: number): number {
  return BAYER[((y & 3) << 2) | (x & 3)] / 16;
}

/** Palette step for a solid sub-pixel, before edge lighting. */
export function subStep(m: Mat, sx: number, sy: number, gx: number, gy: number, D: number, seed: number): number {
  switch (m) {
    case Mat.Stone: {
      // Warped sedimentary strata (dither only in transitions), pebbles, flecks.
      const warp = valueNoise(sx / (24 * D), sy / (24 * D), seed ^ 0x51) * 7 * D;
      const band = valueNoise(sx / (34 * D), (sy + warp) / (3.4 * D), seed ^ 0x52) * 2;
      const f = band % 1;
      let s = 1 + Math.floor(band) + (f < 0.4 ? 0 : f > 0.6 ? 1 : bayer(sx, sy) < (f - 0.4) / 0.2 ? 1 : 0);
      const peb = hash01(sx >> 2, sy >> 2, seed ^ 0x53);
      if (peb > 0.965) {
        // Rounded pebble: lit top-left, shaded bottom-right.
        const px = sx & 3;
        const py = sy & 3;
        if ((px === 0 || px === 3) && (py === 0 || py === 3)) return Math.min(3, s);
        return px + py <= 2 ? 4 : px + py >= 5 ? 1 : 3;
      }
      if (hash01(sx, sy, seed ^ 0x54) > 0.9985) s = 4;
      return Math.min(s === 4 ? 4 : 3, s);
    }
    case Mat.DenseRock: {
      const n = valueNoise(sx / (8 * D), sy / (8 * D), seed ^ 0x61);
      if (Math.abs(n - 0.5) < 0.018) return 0; // fine crack network
      if (Math.abs(n - 0.5) < 0.03) return 3; // lit lip of the crack
      const base = valueNoise(sx / (20 * D), sy / (20 * D), seed ^ 0x62);
      let s = 1 + (bayer(sx, sy) < base * 0.9 ? 1 : 0);
      if (hash01(sx, sy, seed ^ 0x63) > 0.996) s = 4; // mineral sparkle
      return s;
    }
    case Mat.ResonanceCrystal: {
      // Large facets with crisp boundaries, shine streaks and sparkles.
      const cell = hash01(gx >> 1, gy >> 1, seed ^ 0x71);
      const facet = (((sx + sy * (cell > 0.5 ? 1 : -1)) >> 2) + Math.floor(cell * 7)) & 3;
      if ((sx - sy * 2 + 1_000_000) % (11 * D) < 2) return 4;
      if (hash01(sx, sy, seed ^ 0x72) > 0.985) return 4;
      return 1 + Math.min(2, facet);
    }
    case Mat.UnstableOre: {
      const nug = hash01(sx >> 2, sy >> 2, seed ^ 0x81);
      if (nug > 0.5) {
        const px = sx & 3;
        const py = sy & 3;
        if ((px === 0 || px === 3) && (py === 0 || py === 3)) return 1;
        return px + py <= 2 ? 4 : 3; // glowing nugget with hot highlight
      }
      if (nug > 0.42) return 2;
      return bayer(sx, sy) < valueNoise(sx / (5 * D), sy / (5 * D), seed ^ 0x83) * 0.8 ? 1 : 0;
    }
    case Mat.TitaniumMatrix: {
      // Riveted armour plates 8×6 cells, bevelled, with scratches.
      const pw = 8 * D;
      const ph = 6 * D;
      const px = ((sx % pw) + pw) % pw;
      const py = ((sy % ph) + ph) % ph;
      if (py === ph - 1 || px === pw - 1) return 0;
      if (py === 0 || px === 0) return 4;
      if (py === ph - 2 || px === pw - 2) return 1;
      if (py === 1 || px === 1) return 3;
      const rx = px === 3 || px === pw - 5;
      const ry = py === 3 || py === ph - 5;
      if (rx && ry) return 4; // rivet
      if ((px === 4 || px === pw - 4) && (py === 4 || py === ph - 4)) return 0; // rivet shadow
      if (hash01(sx >> 1, sy, seed ^ 0x93) > 0.995) return 3; // scratch
      return 2 - (bayer(sx, sy) < (py / ph) * 0.6 ? 1 : 0);
    }
    case Mat.CoreMaterial: {
      const ring = Math.sin(((sx * 0.9 + sy * 0.35) / D) * 0.7 + valueNoise(sx / (6 * D), sy / (6 * D), seed ^ 0x91) * 6);
      const s = 1 + Math.floor((ring * 0.5 + 0.5) * 2.99);
      return hash01(sx, sy, seed ^ 0x92) > 0.99 ? 4 : s;
    }
    default:
      return 2;
  }
}

/** Cave back-wall (seen through tunnels): natural slabs, fissures, props. */
export function backColor(sx: number, sy: number, depth01: number, D: number, seed: number): number {
  const n = valueNoise(sx / (12 * D), sy / (9 * D), seed ^ 0xbac);
  const fissure = Math.abs(n - 0.5) < 0.014 || Math.abs(valueNoise(sx / (6 * D), sy / (15 * D), seed ^ 0xbad) - 0.5) < 0.008;
  let step = fissure ? 0 : 1 + (bayer(sx, sy) < valueNoise(sx / (30 * D), sy / (30 * D), seed ^ 0xbae) ? 1 : 0);
  if (!fissure && Math.abs(valueNoise(sx / (12 * D), (sy - 1) / (9 * D), seed ^ 0xbac) - 0.5) < 0.014) step = 3;
  // Props on a 4×4-cell grid: dormant crystal shards, fossil spines.
  const G = 4 * D;
  const cx = Math.floor(sx / G);
  const cy = Math.floor(sy / G);
  const prop = hash01(cx, cy, seed ^ 0xb2);
  const lx = sx - cx * G;
  const ly = sy - cy * G;
  let col = BACK[Math.min(4, step)];
  if (prop > 0.97) {
    const h = Math.abs(lx - G / 2);
    if (ly > 2 && ly < G - 2 && h <= (ly - 2) / 3) col = ly < G / 2 ? 0x1d5d70 : 0x133f4e;
  } else if (prop < 0.012) {
    if (ly === G / 2 && lx > 1 && lx < G - 2) col = lx & 1 ? 0x3b3748 : 0x2b2838;
    else if ((ly === G / 2 - 1 || ly === G / 2 + 1) && (lx & 2) === 0 && lx > 2 && lx < G - 3) col = 0x2b2838;
  }
  return scale(col, 1 - Math.min(0.4, depth01 * 0.5));
}

/** Grass blade height (in sub-pixels) for an air cell sitting on a surface cell. */
export function bladeHeight(sx: number, gy: number, D: number, seed: number): number {
  const h = hash01(sx, gy, seed ^ 0x9a5);
  if (h < 0.25) return 0;
  return Math.max(1, Math.floor(h * h * (D + 1)));
}

export function bladeColor(sx: number, row: number, height: number): number {
  return row === height - 1 ? MOSS[4] : row === height - 2 ? MOSS[3] : sx & 1 ? MOSS[2] : MOSS[3];
}

/** Glowing cave fungus (stem + cap). j = rows above the floor. Returns colour or -1. */
export function fungusPixel(i: number, j: number, D: number): number {
  const mid = Math.floor(D / 2);
  if (i === mid && j <= 1) return FUNGUS[0];
  if (j === 2 && Math.abs(i - mid) <= 1) return FUNGUS[1];
  if (j === 3 && i === mid) return FUNGUS[2];
  return -1;
}

export function scale(rgb: number, k: number): number {
  const r = Math.min(255, ((rgb >> 16) & 0xff) * k);
  const g = Math.min(255, ((rgb >> 8) & 0xff) * k);
  const b = Math.min(255, (rgb & 0xff) * k);
  return (r << 16) | (g << 8) | b;
}

// --- Illustrated boulder fill for Stone / Dense Rock (matches the backdrop rock kit) ---

/** Writes the 9 jittered Voronoi sites (sub-pixel coords) around a cell into `out` (18 floats). */
export function boulderSites(gx: number, gy: number, D: number, sizeCells: number, seed: number, out: Float32Array): void {
  const G = sizeCells * D;
  const cx = Math.floor((gx * D) / G);
  const cy = Math.floor((gy * D) / G);
  let k = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const X = cx + i;
      const Y = cy + j;
      out[k++] = (X + 0.2 + hash01(X, Y, seed) * 0.6) * G;
      out[k++] = (Y + 0.2 + hash01(Y, X, seed ^ 0x5f) * 0.6) * G;
    }
  }
}

/**
 * Palette step for a boulder-field sub-pixel: each Voronoi cell is a stone
 * lit like a pillow from the upper left (flat middle, rounded rim), with
 * dark crevices between stones and a lit lip on their upper-left rims.
 * Clustered tones only — no dithering, no single-pixel noise.
 */
export function boulderStep(sx: number, sy: number, sites: Float32Array, seed: number): number {
  let d1 = 1e9, d2 = 1e9, bx = 0, by = 0;
  for (let k = 0; k < 18; k += 2) {
    const dx = sx - sites[k];
    const dy = (sy - sites[k + 1]) * 1.35; // slightly flattened stones
    const d = dx * dx + dy * dy;
    if (d < d1) { d2 = d1; d1 = d; bx = sites[k]; by = sites[k + 1]; } else if (d < d2) d2 = d;
  }
  const r1 = Math.sqrt(d1);
  const edge = Math.sqrt(d2) - r1;
  if (edge < 1.6) return 0; // crevice between stones
  const t = r1 / (r1 + edge * 0.5); // 0 centre → 1 rim
  const len = r1 || 1;
  const nx = (sx - bx) / len;
  const ny = (sy - by) / len;
  const k = t * t * t;
  const pz = Math.sqrt(Math.max(0, 1 - k * k));
  const l = nx * k * -0.55 + ny * k * -0.72 + pz * 0.42 + (hash01(Math.floor(bx), Math.floor(by), seed) - 0.5) * 0.12;
  let s = l > 0.5 ? 3 : l > 0.32 ? 2 : l > 0.1 ? 1 : 0;
  if (edge < 3.2 && nx * -0.55 + ny * -0.72 > 0.3) s = 4; // lit upper-left lip
  return Math.max(1, s);
}

/** Grass tufts (clustered, not per-pixel): height in sub-pixels for column i of a surface cell. */
export function tuftHeight(gx: number, gy: number, i: number, D: number, seed: number): number {
  if (hash01(gx, gy, seed ^ 0x7f) < 0.45) return 0; // bare cell
  const shape = [1, 3, 2, 4, 2, 3, 1, 2];
  const off = Math.floor(hash01(gx, gy, seed ^ 0x80) * 8);
  return Math.min(D + 1, shape[(i + off) % 8] + (hash01(gx, gy, seed ^ 0x81) > 0.7 ? 1 : 0));
}
