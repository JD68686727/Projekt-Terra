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

// --- Unified style kit (ref: chunky cliff/waterfall pixel art) ------------
// Palette layout for rock & foliage: [outline, dark, mid, light, highlight].

/**
 * One rock block: rounded corners, 1px dark outline (reads as crevices
 * between blocks), lit top band + left edge, shaded right edge + bottom,
 * mottled interior with cracks and specks.
 */
export function rockBlock(c: Canvas, x0: number, y0: number, w: number, h: number, pal: readonly number[], seed: number): void {
  // Irregular, chunky outline: left/right insets change in steps every few rows.
  const L = new Int16Array(h);
  const R = new Int16Array(h);
  const step = 3 + Math.floor(hash01(x0, y0, seed) * 3);
  for (let j = 0; j < h; j++) {
    const g = Math.floor(j / step);
    let l = Math.floor(hash01(g, 1, seed + x0) * 4);
    let r = Math.floor(hash01(g, 2, seed + x0) * 4);
    // Rounded / chipped top corners, slightly tapered bottom.
    if (j < 4) {
      l += 4 - j + (hash01(x0, 3, seed) > 0.5 ? 2 : 0);
      r += 4 - j;
    }
    if (j > h - 3) {
      l += 1;
      r += 1;
    }
    L[j] = l;
    R[j] = r;
  }
  // Facet boundaries (lit | mid | shadow) jitter per row group → chunky planes.
  for (let j = 0; j < h; j++) {
    const inner = w - L[j] - R[j];
    if (inner <= 2) continue;
    const g = Math.floor(j / step);
    const f1 = 0.2 + hash01(g, 5, seed + y0) * 0.12;
    const f2 = 0.58 + hash01(g, 6, seed + y0) * 0.14;
    for (let i = L[j]; i < w - R[j]; i++) {
      const x = x0 + i;
      const y = y0 + j;
      const outside = (ii: number, jj: number) => jj < 0 || jj >= h || ii < L[jj] || ii >= w - R[jj];
      const edge = outside(i - 1, j) || outside(i + 1, j) || outside(i, j - 1) || outside(i, j + 1);
      let s: number;
      if (edge) s = 0;
      else if (outside(i, j - 2) || outside(i, j - 3)) s = outside(i, j - 2) ? 4 : 3; // lit top surfaces (also on ledges)
      else {
        const rel = (i - L[j]) / inner;
        s = rel < f1 ? 3 : rel < f2 ? 2 : 1;
        if (j >= h - 3) s = Math.max(1, s - 1);
        if (hash01(x, y, seed ^ 0x52) > 0.993) s = Math.min(4, s + 1);
      }
      put(c, x, y, pal[s]);
    }
  }
  // One or two deep cracks.
  if (hash01(x0, y0, seed ^ 7) > 0.4) {
    let cx = x0 + Math.floor(w * (0.3 + 0.4 * hash01(x0, 8, seed)));
    for (let j = 4; j < h * 0.75; j++) {
      if (hash01(j, x0, seed) > 0.7) cx += hash01(x0, j, seed) > 0.5 ? 1 : -1;
      put(c, cx, y0 + j, pal[0]);
      put(c, cx + 1, y0 + j, pal[3]);
    }
  }
}

/** Moss / grass cap on a block top: uneven tufts hanging slightly over the edge. */
export function mossCap(c: Canvas, x0: number, y0: number, w: number, pal: readonly number[], seed: number): void {
  for (let i = 1; i < w - 1; i++) {
    const x = x0 + i;
    const hUp = Math.floor(hash01(x, y0, seed) * 3);
    const hDown = 1 + Math.floor(hash01(x, y0 + 1, seed) * (hash01(x, 3, seed) > 0.8 ? 5 : 2));
    for (let j = -hUp; j < hDown; j++) {
      const s = j < 0 ? 4 : j === 0 ? 3 : j === hDown - 1 ? 1 : 2;
      put(c, x, y0 + j, pal[s]);
    }
  }
}

/** Hanging vine with leaf dots and an optional glowing flower at the end. */
export function vine(c: Canvas, x: number, y0: number, len: number, leaf: readonly number[], glow: readonly number[] | null, seed: number): void {
  let xx = x;
  for (let j = 0; j < len; j++) {
    if (hash01(x, j, seed) > 0.8) xx += hash01(j, x, seed) > 0.5 ? 1 : -1;
    put(c, xx, y0 + j, leaf[j % 5 === 0 ? 3 : 2]);
    if (j % 4 === 2) put(c, xx + (j % 8 === 2 ? 1 : -1), y0 + j, leaf[3]);
  }
  if (glow) {
    put(c, xx, y0 + len, glow[0]);
    put(c, xx - 1, y0 + len, glow[1]);
    put(c, xx + 1, y0 + len, glow[1]);
    put(c, xx, y0 + len + 1, glow[1]);
  }
}

/**
 * Bushy foliage clump in the same language as the rocks: overlapping
 * blobs, clustered 3-tone shading lit from the upper left, full 1px
 * outline, leaf-cluster highlights.
 */
export function bush(c: Canvas, cx: number, cy: number, r: number, pal: readonly number[], seed: number): void {
  const k = 4 + Math.floor(hash01(cx, cy, seed) * 4);
  const blobs: [number, number, number][] = [[cx, cy, r * 0.7]];
  for (let i = 0; i < k; i++) {
    const a = Math.PI + (i / (k - 1)) * Math.PI + (hash01(i, cx, seed) - 0.5) * 0.5; // upper half
    blobs.push([cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.35, r * (0.38 + hash01(i, 7, seed) * 0.2)]);
  }
  // Pass 1: fill mask with shaded tones; pass 2 adds the outline.
  const x0 = Math.floor(cx - r * 1.3);
  const x1 = Math.ceil(cx + r * 1.3);
  const y0 = Math.floor(cy - r * 1.1);
  const y1 = Math.ceil(cy + r * 0.8);
  const W = x1 - x0 + 3;
  const H = y1 - y0 + 3;
  const mask = new Int8Array(W * H).fill(-1);
  for (const [bx, by, br] of blobs) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x + 0.5 - bx) / br;
        const dy = (y + 0.5 - by) / br;
        const bump = 1 - 0.16 * valueNoise(x / 2.6, y / 2.6, seed ^ 0x6b);
        if (dx * dx + dy * dy > bump * bump) continue;
        const nz = Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy));
        const l = -dx * 0.6 - dy * 0.65 + nz * 0.45 + (valueNoise(x / 3.5, y / 3.5, seed ^ 0x6c) - 0.5) * 0.7;
        const s = l > 0.55 ? 4 : l > 0.15 ? 3 : l > -0.25 ? 2 : 1;
        mask[(y - y0 + 1) * W + (x - x0 + 1)] = s;
      }
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = mask[y * W + x];
      const at = (xx: number, yy: number) => (xx < 0 || yy < 0 || xx >= W || yy >= H ? -1 : mask[yy * W + xx]);
      if (v >= 0) put(c, x0 - 1 + x, y0 - 1 + y, pal[v]);
      else if (at(x - 1, y) >= 0 || at(x + 1, y) >= 0 || at(x, y - 1) >= 0 || at(x, y + 1) >= 0) put(c, x0 - 1 + x, y0 - 1 + y, pal[0]);
    }
  }
}

/**
 * Rock formation: columns of stacked blocks of varying height (ref: cliff
 * walls), each column topped with moss and a bush, vines hanging down.
 */
export function cliffs(
  c: Canvas,
  baseY: number,
  maxH: number,
  colW: number,
  rock: readonly number[],
  leaf: readonly number[],
  glow: readonly number[] | null,
  seed: number,
  density = 1,
): void {
  const cols = Math.floor(c.w / colW);
  const tops: [number, number, number][] = [];
  for (let k = 0; k < cols; k++) {
    if (hash01(k, 1, seed) > density) continue;
    const w = Math.floor(colW * (0.8 + hash01(k, 2, seed) * 0.6));
    const x = k * colW + Math.floor((colW - w) / 2);
    const height = Math.floor(maxH * (0.35 + 0.65 * Math.pow(hash01(k, 3, seed), 0.8)));
    let y = baseY;
    let i = 0;
    while (y > baseY - height) {
      const bh = Math.floor(colW * (0.7 + hash01(k, 10 + i, seed) * 0.6));
      const shift = Math.floor((hash01(k, 30 + i, seed) - 0.5) * colW * 0.25);
      const bw = Math.floor(w * (0.85 + hash01(k, 50 + i, seed) * 0.25));
      rockBlock(c, x + shift, y - bh, bw, bh + 2, rock, seed + k * 97 + i);
      y -= bh;
      i++;
    }
    tops.push([x + Math.floor(w / 2), y, w]);
  }
  for (const [x, y, w] of tops) {
    mossCap(c, x - Math.floor(w / 2), y + 1, w, leaf, seed ^ x);
    if (hash01(x, 4, seed) > 0.4) bush(c, x + Math.floor((hash01(x, 5, seed) - 0.5) * w * 0.5), y - 1, Math.floor(w * (0.22 + hash01(x, 6, seed) * 0.16)), leaf, seed ^ (x * 7));
    const nv = Math.floor(hash01(x, 8, seed) * 3);
    for (let v = 0; v < nv; v++) {
      const vx = x - Math.floor(w / 2) + 2 + Math.floor(hash01(x, 20 + v, seed) * (w - 4));
      vine(c, vx, y + 2, Math.floor(w * (0.3 + hash01(x, 30 + v, seed) * 0.8)), leaf, glow && hash01(x, 40 + v, seed) > 0.5 ? glow : null, seed ^ vx);
    }
  }
}

/** Chunky pixel cloud: stacked rounded puffs, flat-ish bottom, two-tone shading. */
export function cloud(c: Canvas, cx: number, cy: number, w: number, pal: readonly number[], seed: number): void {
  const puffs = 3 + Math.floor(hash01(cx, cy, seed) * 3);
  for (let p = 0; p < puffs; p++) {
    const px = cx - w / 2 + (w * (p + 0.5)) / puffs;
    const pr = (w / puffs) * (0.7 + hash01(p, cx, seed) * 0.5);
    const py = cy - pr * 0.35 * (p === Math.floor(puffs / 2) ? 1.6 : 1);
    for (let y = Math.floor(py - pr); y <= cy; y++) {
      for (let x = Math.floor(px - pr); x <= Math.ceil(px + pr); x++) {
        const dx = x - px;
        const dy = y - py;
        if (dx * dx + dy * dy > pr * pr) continue;
        const s = dy < -pr * 0.45 ? 2 : y > cy - 2 ? 0 : 1;
        put(c, x, y, pal[s]);
      }
    }
  }
}
