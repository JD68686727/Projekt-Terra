import { hash01, valueNoise } from '../../world/rng';

/**
 * Procedural pixel-art painters in the style of hand-made parallax
 * backgrounds: clustered shading with a fixed light (upper left), 4–6 tone
 * palettes, outlines/selective rim light, dither only in transitions.
 * All painters write into an RGBA buffer that tiles horizontally (x wraps).
 */
export interface Canvas {
  w: number;
  h: number;
  px: Uint8Array;
}

export function canvas(w: number, h: number): Canvas {
  return { w, h, px: new Uint8Array(w * h * 4) };
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x: number, y: number) => BAYER[((y & 3) << 2) | (x & 3)] / 16;

export function put(c: Canvas, x: number, y: number, rgb: number, a = 255): void {
  if (y < 0 || y >= c.h) return;
  x = ((x % c.w) + c.w) % c.w;
  const p = (y * c.w + x) * 4;
  c.px[p] = (rgb >> 16) & 255;
  c.px[p + 1] = (rgb >> 8) & 255;
  c.px[p + 2] = rgb & 255;
  c.px[p + 3] = a;
}

export function alphaAt(c: Canvas, x: number, y: number): number {
  if (y < 0 || y >= c.h) return 0;
  x = ((x % c.w) + c.w) % c.w;
  return c.px[(y * c.w + x) * 4 + 3];
}

export function mix(a: number, b: number, t: number): number {
  const r = ((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * t;
  const g = ((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * t;
  const bl = (a & 255) + ((b & 255) - (a & 255)) * t;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

/** Pushes a palette toward the haze colour (atmospheric perspective). */
export function haze(pal: readonly number[], hazeCol: number, t: number): number[] {
  return pal.map((c) => mix(c, hazeCol, t));
}

/** Light direction (upper left), normalised. */
const LX = -0.6;
const LY = -0.65;
const LZ = 0.47;

/** Quantised sphere lighting → palette index (0 dark … n-1 light), with dithered band edges. */
function sphereStep(nx: number, ny: number, n: number, x: number, y: number, bias = 0): number {
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  const l = Math.max(0, nx * LX + ny * LY + nz * LZ) + bias;
  const v = l * (n - 1) + (bayer(x, y) - 0.5) * 0.6;
  return Math.max(0, Math.min(n - 1, Math.round(v)));
}

/**
 * Leafy canopy: a cluster of overlapping blobs, each lit like a sphere,
 * plus small leaf-clump noise so it reads like foliage (ref: painterly
 * pixel forests). Drawn bottom/back blobs first.
 */
export function canopy(c: Canvas, cx: number, cy: number, r: number, pal: readonly number[], seed: number): void {
  const k = 5 + Math.floor(hash01(cx, cy, seed) * 4);
  const blobs: [number, number, number][] = [];
  for (let i = 0; i < k; i++) {
    const a = (i / k) * Math.PI * 2 + hash01(i, cx, seed) * 0.8;
    const d = r * (0.35 + hash01(i, cy, seed) * 0.35);
    blobs.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.6, r * (0.42 + hash01(i, 7, seed) * 0.25)]);
  }
  blobs.push([cx, cy - r * 0.2, r * 0.6]);
  blobs.sort((a, b) => b[1] - a[1] === 0 ? 0 : a[1] > b[1] ? -1 : 1); // lower blobs first
  for (const [bx, by, br] of blobs) {
    const x0 = Math.floor(bx - br - 1);
    const x1 = Math.ceil(bx + br + 1);
    const y0 = Math.floor(by - br - 1);
    const y1 = Math.ceil(by + br + 1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x + 0.5 - bx) / br;
        const dy = (y + 0.5 - by) / br;
        // Bumpy outline: leaf clumps along the edge.
        const edge = 1 - 0.18 * valueNoise((x + 1000) / 3.2, y / 3.2, seed ^ 0x1eaf);
        const d2 = dx * dx + dy * dy;
        if (d2 > edge * edge) continue;
        const clump = (valueNoise(x / 4, y / 4, seed ^ 0x2eaf) - 0.5) * 0.55;
        let s = sphereStep(dx * 0.9, dy * 0.9, pal.length - 1, x, y, clump);
        // Outline ring: darkest tone at the very edge on the shadow side.
        if (d2 > edge * edge * 0.82 && dx + dy > 0.2) s = 0;
        // Index 0 is reserved for the outline; lit tones are shifted up by one.
        put(c, x, y, pal[s === 0 ? 0 : Math.min(pal.length - 1, s + 1)]);
      }
    }
  }
}

/** Trunk with a couple of branches; lit left edge, dark right edge. */
export function trunk(c: Canvas, x: number, yBase: number, yTop: number, width: number, pal: readonly number[], seed: number): void {
  for (let y = yTop; y <= yBase; y++) {
    const t = (y - yTop) / Math.max(1, yBase - yTop);
    const w = Math.max(1, Math.round(width * (0.55 + 0.45 * t)));
    const sway = Math.round(Math.sin(y * 0.05 + seed) * 1.5);
    for (let i = 0; i < w; i++) {
      const col = i === 0 ? pal[2] : i === w - 1 ? pal[0] : pal[1];
      put(c, x + sway + i - (w >> 1), y, col);
    }
  }
  // Branches.
  const nb = 2 + Math.floor(hash01(x, yBase, seed) * 2);
  for (let b = 0; b < nb; b++) {
    const by = Math.floor(yTop + (yBase - yTop) * (0.15 + 0.3 * hash01(b, x, seed)));
    const dir = hash01(b, 5, seed + x) > 0.5 ? 1 : -1;
    const len = 6 + Math.floor(hash01(b, 9, seed + x) * 10);
    for (let i = 0; i < len; i++) put(c, x + dir * i, by - Math.floor(i * 0.7), i === 0 ? pal[1] : pal[dir < 0 ? 2 : 0]);
  }
}

/** Alien conifer: stacked jagged tiers, lit left half / dark right half. */
export function conifer(c: Canvas, x: number, yBase: number, height: number, pal: readonly number[], seed: number): void {
  const tiers = 4 + Math.floor(height / 26);
  const top = yBase - height;
  for (let y = top; y <= yBase; y++) {
    const t = (y - top) / height;
    const tierPos = (t * tiers) % 1;
    // Each tier flares out then steps in → classic pine silhouette.
    const half = Math.round((2 + t * height * 0.32) * (0.55 + 0.45 * tierPos));
    for (let i = -half; i <= half; i++) {
      const jag = hash01(x + i, y, seed) > 0.85 && Math.abs(i) === half;
      if (jag) continue;
      let s = i < -half * 0.15 ? 2 : i > half * 0.35 ? 0 : 1;
      if (tierPos < 0.12 && i < 0) s = 3; // lit tier top edge
      put(c, x + i, y, pal[Math.min(pal.length - 1, s)]);
    }
  }
}

/**
 * Faceted mountain range: overlapping peaks, each split into a lit left
 * face and a shaded right face along a jagged ridge line, plus secondary
 * gullies — reads as 3D rock instead of a flat silhouette.
 */
export function mountains(c: Canvas, baseY: number, maxH: number, count: number, pal: readonly number[], seed: number): void {
  const peaks: { x: number; h: number; w: number; depth: number }[] = [];
  for (let i = 0; i < count; i++) {
    peaks.push({
      x: Math.floor(hash01(i, 1, seed) * c.w),
      h: maxH * (0.45 + 0.55 * hash01(i, 2, seed)),
      w: maxH * (0.9 + 0.9 * hash01(i, 3, seed)),
      depth: hash01(i, 4, seed),
    });
  }
  peaks.sort((a, b) => a.depth - b.depth); // back to front
  for (const p of peaks) {
    const ridgeShift = (hash01(p.x, 6, seed) - 0.5) * p.w * 0.25;
    for (let dx = -Math.ceil(p.w); dx <= Math.ceil(p.w); dx++) {
      const t = Math.abs(dx) / p.w;
      if (t > 1) continue;
      const jag = (valueNoise((p.x + dx) / 6, p.x, seed ^ 0x3a) - 0.5) * p.h * 0.12;
      const top = Math.floor(baseY - p.h * (1 - t) * (1 - t * 0.15) + jag);
      for (let y = Math.max(0, top); y < baseY; y++) {
        const x = p.x + dx;
        const depth = (y - top) / Math.max(1, baseY - top);
        const ridge = dx - ridgeShift * (1 - depth);
        let s: number;
        if (ridge < 0) s = 3; // lit face
        else s = 1; // shaded face
        // Gullies: diagonal darker streaks running down the faces.
        const g = valueNoise((x + y * (ridge < 0 ? 0.55 : -0.55)) / 5, y / 30, seed ^ 0x9e);
        if (g > 0.68) s -= 1;
        else if (g < 0.22 && ridge < 0) s += 1;
        // Ridge line highlight + snow/crystal caps near the top.
        if (Math.abs(ridge) < 1.2 && depth < 0.6) s = ridge < 0 ? 4 : 2;
        if (y - top < 2) s = ridge < 0 ? 4 : 2;
        // Fade into the base (ground haze handles the rest).
        if (depth > 0.75 && bayer(x, y) < (depth - 0.75) * 3) s = Math.max(0, s - 1);
        put(c, x, y, pal[Math.max(0, Math.min(pal.length - 1, s))]);
      }
    }
  }
}

/** Soft ground haze band: transparent at top → haze colour at the bottom, dithered. */
export function hazeBand(c: Canvas, y0: number, y1: number, col: number, maxA: number): void {
  for (let y = y0; y < y1; y++) {
    const t = (y - y0) / Math.max(1, y1 - y0);
    for (let x = 0; x < c.w; x++) {
      if (t * 1.1 < bayer(x, y) * 0.9) continue;
      const a = Math.round(maxA * Math.min(1, t * t * 1.2 + 0.08));
      const p = (y * c.w + x) * 4;
      const ea = c.px[p + 3] / 255;
      // Blend haze over whatever is there.
      const k = a / 255;
      c.px[p] = c.px[p] * (1 - k) + ((col >> 16) & 255) * k;
      c.px[p + 1] = c.px[p + 1] * (1 - k) + ((col >> 8) & 255) * k;
      c.px[p + 2] = c.px[p + 2] * (1 - k) + (col & 255) * k;
      c.px[p + 3] = Math.round(255 * Math.max(ea, k));
    }
  }
}

/** Glowing bulbs (alien fruit / spores) scattered over canopies. */
export function glowDots(c: Canvas, n: number, pal: readonly number[], seed: number): void {
  for (let i = 0; i < n; i++) {
    const x = Math.floor(hash01(i, 1, seed) * c.w);
    const y = Math.floor(hash01(i, 2, seed) * c.h);
    if (alphaAt(c, x, y) === 0) continue;
    put(c, x, y, pal[1]);
    put(c, x + 1, y, pal[0]);
    put(c, x, y - 1, pal[0]);
  }
}
