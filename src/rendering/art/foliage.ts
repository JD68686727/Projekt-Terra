import { hash01 } from '../../world/rng';
import { Canvas, alphaAt, put } from '../backdrop/painters';

/**
 * Illustrated foliage kit.
 *
 * Canopies and bushes are assembled from hand-drawn leaf-clump stamps
 * (character maps, 4 tones: h=highlight, l=light, m=mid, d=dark). Each
 * placed clump is tone-shifted by its position in the canopy (upper-left
 * clumps lighter, inner / lower clumps darker), clumps are placed back to
 * front, and a selective dark outline is added on the shadow sides
 * afterwards. Result: layered, asymmetric, readable foliage instead of
 * round blobs or noise.
 *
 * Palette layout: [outline, deep, dark, mid, light, highlight].
 */
export type Pal6 = readonly [number, number, number, number, number, number];

const STAMPS: string[][] = [
  [
    '..hl....',
    '.hllm...',
    'hllmmm..',
    'lllmmmd.',
    'lmmmmdd.',
    '.mmmdd..',
    '..dd....',
  ],
  [
    '...hh...',
    '.hhllm..',
    'hlllmmm.',
    'llmmmmdd',
    '.mmmddd.',
    '..md.d..',
  ],
  [
    '.hl..',
    'hllm.',
    'llmmd',
    'mmmdd',
    '.md..',
  ],
  [
    '....hl...',
    '..hhllm..',
    '.hlllmmm.',
    'hllmmmmdd',
    'lmmmmdddd',
    '.mmmdddd.',
    '...dd.d..',
  ],
];

const TONE: Record<string, number> = { h: 5, l: 4, m: 3, d: 2 };

/** Stamps one clump; `shift` darkens (positive) or brightens (negative) all tones. */
function stamp(c: Canvas, x: number, y: number, which: number, shift: number, pal: Pal6, flip: boolean): void {
  const rows = STAMPS[which % STAMPS.length];
  const w = rows[0].length;
  for (let j = 0; j < rows.length; j++) {
    for (let i = 0; i < w; i++) {
      const ch = rows[j][flip ? w - 1 - i : i];
      if (ch === '.') continue;
      const t = Math.max(1, Math.min(5, TONE[ch] - shift));
      put(c, x + i, y + j, pal[t]);
    }
  }
}

/** Selective outline: darkest tone on empty pixels right/below of foliage (shadow side). */
function selout(c: Canvas, x0: number, y0: number, x1: number, y1: number, pal: Pal6, mark: Uint8Array, mw: number): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y - y0) * mw + (x - x0);
      if (mark[i]) continue;
      if (alphaAt(c, x, y) !== 0) continue;
      const left = x > x0 && mark[i - 1];
      const up = y > y0 && mark[i - mw];
      if (left || up) put(c, x, y, pal[0]);
    }
  }
}

export interface Lobe {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

/**
 * Fills a set of elliptical lobes with leaf clumps. Clump density, tone
 * and order give layered depth: inner/lower clumps darker, rim clumps on
 * the lit side brighter, rim clumps poke out of the silhouette (organic edge).
 */
export function foliage(c: Canvas, lobes: Lobe[], pal: Pal6, seed: number): void {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const l of lobes) {
    x0 = Math.min(x0, l.x - l.rx - 10);
    x1 = Math.max(x1, l.x + l.rx + 10);
    y0 = Math.min(y0, l.y - l.ry - 10);
    y1 = Math.max(y1, l.y + l.ry + 10);
  }
  x0 = Math.floor(x0); y0 = Math.floor(y0); x1 = Math.ceil(x1); y1 = Math.ceil(y1);
  const mw = x1 - x0 + 1;
  const mark = new Uint8Array(mw * (y1 - y0 + 1));
  // Snapshot alpha to know which pixels this call painted (for the outline).
  const before = new Uint8Array(mark.length);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) before[(y - y0) * mw + (x - x0)] = alphaAt(c, x, y) ? 1 : 0;

  // Candidate clump positions on a jittered grid inside the lobes.
  const pts: { x: number; y: number; depth: number; light: number }[] = [];
  const step = 5;
  for (let y = y0; y <= y1; y += step) {
    for (let x = x0; x <= x1; x += step) {
      const jx = x + Math.floor((hash01(x, y, seed) - 0.5) * step);
      const jy = y + Math.floor((hash01(y, x, seed) - 0.5) * step);
      let best = Infinity;
      let lx = 0, ly = 0;
      for (const l of lobes) {
        const u = (jx - l.x) / l.rx;
        const v = (jy - l.y) / l.ry;
        const d = Math.hypot(u, v);
        if (d < best) { best = d; lx = u; ly = v; }
      }
      if (best > 1.05) continue;
      pts.push({ x: jx, y: jy, depth: best, light: -lx * 0.55 - ly * 0.8 });
    }
  }
  // Back to front: inner first, then rim; within that top-down.
  pts.sort((a, b) => a.depth - b.depth || a.y - b.y);
  for (const p of pts) {
    let shift = 1; // base: mid tones
    if (p.light > 0.35 && p.depth > 0.45) shift = -1; // lit rim clumps
    else if (p.light > 0.05) shift = 0;
    else if (p.light < -0.45) shift = 2; // shaded underside
    if (p.depth < 0.35) shift += 1; // interior reads darker
    const which = Math.floor(hash01(p.x, p.y, seed ^ 0x5a) * STAMPS.length);
    stamp(c, p.x - 4, p.y - 3, which, shift, pal, hash01(p.y, p.x, seed ^ 0x5b) > 0.5);
  }
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = (y - y0) * mw + (x - x0);
    mark[i] = !before[i] && alphaAt(c, x, y) ? 1 : 0;
  }
  selout(c, x0, y0, x1, y1, pal, mark, mw);
}

/** Recursive branching trunk; returns branch tips for canopy lobes. */
function branch(c: Canvas, x: number, y: number, ang: number, len: number, w: number, depth: number, bark: readonly number[], seed: number, tips: { x: number; y: number }[]): void {
  const ex = x + Math.cos(ang) * len;
  const ey = y + Math.sin(ang) * len;
  const steps = Math.ceil(len);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const px = x + (ex - x) * t;
    const py = y + (ey - y) * t;
    const ww = Math.max(1, Math.round(w * (1 - t * 0.35)));
    for (let k = 0; k < ww; k++) {
      const col = k === 0 ? bark[2] : k === ww - 1 && ww > 1 ? bark[0] : bark[1];
      put(c, Math.round(px - ww / 2 + k), Math.round(py), col);
    }
  }
  if (depth <= 0 || len < 4) {
    tips.push({ x: ex, y: ey });
    return;
  }
  const spread = 0.35 + hash01(depth, x, seed) * 0.3;
  branch(c, ex, ey, ang - spread, len * (0.62 + hash01(1, depth + x, seed) * 0.15), Math.max(1, w * 0.62), depth - 1, bark, seed + 1, tips);
  branch(c, ex, ey, ang + spread * (0.8 + hash01(2, depth, seed) * 0.4), len * (0.58 + hash01(3, depth + y, seed) * 0.15), Math.max(1, w * 0.58), depth - 1, bark, seed + 2, tips);
}

/** Tree with a believable trunk, branches and a layered, asymmetric crown. */
export function tree(c: Canvas, x: number, groundY: number, height: number, leaf: Pal6, bark: readonly number[], seed: number): void {
  const tips: { x: number; y: number }[] = [];
  const trunkLen = height * (0.38 + hash01(x, 1, seed) * 0.12);
  const lean = (hash01(x, 2, seed) - 0.5) * 0.25;
  branch(c, x, groundY, -Math.PI / 2 + lean, trunkLen, Math.max(3, height * 0.07), 2, bark, seed, tips);
  // Roots flare.
  for (let k = 1; k <= 3; k++) {
    put(c, x - Math.round(height * 0.03) - k, groundY - 1 + Math.floor(k / 2), bark[1]);
    put(c, x + Math.round(height * 0.03) + k, groundY - 1 + Math.floor(k / 2), bark[0]);
  }
  const lobes: Lobe[] = tips.map((t, i) => ({
    x: t.x,
    y: t.y - height * 0.05,
    rx: height * (0.17 + hash01(i, 3, seed) * 0.08),
    ry: height * (0.12 + hash01(i, 4, seed) * 0.05),
  }));
  lobes.push({ x: x + lean * height * 0.6, y: groundY - trunkLen - height * 0.1, rx: height * 0.24, ry: height * 0.16 });
  foliage(c, lobes, leaf, seed ^ 0x7e);
}

/** Asymmetric ground bush: 2-4 lobes sitting on the ground line. */
export function shrub(c: Canvas, x: number, groundY: number, size: number, leaf: Pal6, seed: number): void {
  const n = 2 + Math.floor(hash01(x, groundY, seed) * 3);
  const lobes: Lobe[] = [];
  for (let i = 0; i < n; i++) {
    const rx = size * (0.45 + hash01(i, 1, seed + x) * 0.3);
    const ry = rx * (0.6 + hash01(i, 2, seed + x) * 0.25);
    lobes.push({ x: x + (i - (n - 1) / 2) * size * 0.55 + (hash01(i, 3, seed) - 0.5) * size * 0.3, y: groundY - ry * 0.85, rx, ry });
  }
  foliage(c, lobes, leaf, seed ^ (x * 13));
}

/** Alien glow plant: thin curved stems with luminous bulbs. */
export function glowPlant(c: Canvas, x: number, groundY: number, h: number, stem: number, glow: readonly number[], seed: number): void {
  const stems = 2 + Math.floor(hash01(x, 1, seed) * 3);
  for (let s = 0; s < stems; s++) {
    const hh = h * (0.6 + hash01(s, x, seed) * 0.4);
    const curve = (hash01(s, 2, seed + x) - 0.5) * 6;
    let px = x + (s - stems / 2) * 2;
    let py = groundY;
    for (let j = 0; j < hh; j++) {
      px = x + (s - stems / 2) * 2 + Math.round(curve * (j / hh) ** 2);
      py = groundY - j;
      put(c, px, py, stem);
    }
    put(c, px, py - 1, glow[0]);
    put(c, px - 1, py - 1, glow[1]);
    put(c, px + 1, py - 1, glow[1]);
    put(c, px, py - 2, glow[1]);
    put(c, px, py, glow[1]);
  }
}
