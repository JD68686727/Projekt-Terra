/**
 * Echo biomes: every Echo level recolours the underground (stone, dense rock,
 * moss, cave wall) and hue-shifts the whole sky/backdrop. Ores, crystals,
 * titanium and cores keep their colours so they stay readable everywhere.
 * Echo 0 is the original look.
 */
export interface Biome {
  readonly name: string;
  /** Underground hue/saturation (null = original palette). */
  readonly stone: { h: number; s: number } | null;
  readonly moss: { h: number; s: number } | null;
  /** Hue rotation (degrees) applied to sky, nebula, planet and ridges. */
  readonly sky: number;
}

export const BIOMES: readonly Biome[] = [
  { name: 'ERDE', stone: null, moss: null, sky: 0 },
  { name: 'ROTE WÜSTE', stone: { h: 8, s: 0.38 }, moss: { h: 32, s: 0.55 }, sky: 80 },
  { name: 'DSCHUNGEL', stone: { h: 150, s: 0.26 }, moss: { h: 95, s: 0.6 }, sky: -125 },
  { name: 'EISWELT', stone: { h: 205, s: 0.3 }, moss: { h: 185, s: 0.5 }, sky: -70 },
  { name: 'GOLDENE KRUSTE', stone: { h: 38, s: 0.36 }, moss: { h: 58, s: 0.5 }, sky: 125 },
];

export function biomeFor(prestige: number): Biome {
  return BIOMES[Math.max(0, Math.floor(prestige)) % BIOMES.length];
}

export function hslToRgb(h: number, s: number, l: number): number {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return (Math.round(f(0) * 255) << 16) | (Math.round(f(8) * 255) << 8) | Math.round(f(4) * 255);
}

/** 5-step ramp (shadow → highlight) for a hue. */
export function ramp(h: number, s: number, lightness: readonly number[]): number[] {
  return lightness.map((l) => hslToRgb(h, s, l));
}

export const STONE_L = [0.14, 0.2, 0.27, 0.37, 0.5];
export const DENSE_L = [0.08, 0.11, 0.16, 0.21, 0.29];
export const MOSS_L = [0.13, 0.22, 0.33, 0.5, 0.7];
export const BACK_L = [0.04, 0.06, 0.08, 0.1, 0.14];

/** Luminance-preserving hue rotation matrix (row-major 3×3). */
export function hueMatrix(deg: number): number[] {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
  ];
}

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

export function shiftRgb(rgb: number, deg: number): number {
  if (deg === 0) return rgb;
  const m = hueMatrix(deg);
  const r = (rgb >> 16) & 255;
  const g = (rgb >> 8) & 255;
  const b = rgb & 255;
  return (clamp(m[0] * r + m[1] * g + m[2] * b) << 16) | (clamp(m[3] * r + m[4] * g + m[5] * b) << 8) | clamp(m[6] * r + m[7] * g + m[8] * b);
}

/** Hue-rotates RGBA pixels in place (alpha untouched). */
export function shiftPixels(px: Uint8Array, deg: number): void {
  if (deg === 0) return;
  const m = hueMatrix(deg);
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    px[i] = clamp(m[0] * r + m[1] * g + m[2] * b);
    px[i + 1] = clamp(m[3] * r + m[4] * g + m[5] * b);
    px[i + 2] = clamp(m[6] * r + m[7] * g + m[8] * b);
  }
}
