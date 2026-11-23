import { hash01, valueNoise } from '../../world/rng';
import { Canvas, put } from '../backdrop/painters';

/**
 * Illustrated rock kit.
 *
 * A boulder is an irregular rounded blob with a "pillow" normal field:
 * flat faces in the middle, rounded edges at the rim. Lighting comes from
 * the upper left and is quantised into clustered tone bands (no dithering,
 * no per-pixel noise), plus a highlight rim on lit edges, a dark rim on the
 * shadow side and a few deliberate cracks. Formations are assembled from
 * boulders by a small shape grammar (main mass → secondary forms → rubble).
 *
 * Palette layout: [outline, shadow, mid, light, highlight].
 */
export type Pal5 = readonly [number, number, number, number, number];

const LX = -0.55;
const LY = -0.72;
const LZ = 0.42;

/** Low-frequency radius modulation → irregular but intentional silhouettes. */
function radius(theta: number, seed: number): number {
  let r = 1;
  for (let k = 2; k <= 4; k++) r += Math.sin(theta * k + hash01(k, 7, seed) * 6.28) * (0.09 / (k - 1));
  return r;
}

export interface BoulderOpts {
  /** Flatten the top (ledge-like). */
  flatTop?: number;
  /** Number of cracks (0-2). */
  cracks?: number;
  /** Shift all tones down (for receding / shadowed rocks). */
  dim?: number;
}

/** Tone index (0-4) of a lit pillow surface. */
export function pillowTone(nx: number, ny: number, d: number, faceNoise: number): number {
  const k = d * d * d;
  const px = nx * k;
  const py = ny * k;
  const pz = Math.sqrt(Math.max(0, 1 - px * px - py * py));
  const l = px * LX + py * LY + pz * LZ + faceNoise;
  return l > 0.62 ? 4 : l > 0.44 ? 3 : l > 0.24 ? 2 : l > 0.02 ? 1 : 0;
}

export function boulder(c: Canvas, cx: number, cy: number, rx: number, ry: number, pal: Pal5, seed: number, o: BoulderOpts = {}): void {
  const flat = o.flatTop ?? 0.25;
  const dim = o.dim ?? 0;
  // Chisel planes: each cuts the blob and becomes a flat, evenly lit face.
  const np = 3 + Math.floor(hash01(cx, cy, seed ^ 0x9) * 2);
  const planes: { nx: number; ny: number; p: number }[] = [];
  for (let i = 0; i < np; i++) {
    const a = (i / np) * Math.PI * 2 + hash01(i, 1, seed) * 1.2;
    planes.push({ nx: Math.cos(a), ny: Math.sin(a), p: 0.72 + hash01(i, 2, seed) * 0.18 });
  }
  const x0 = Math.floor(cx - rx * 1.25);
  const x1 = Math.ceil(cx + rx * 1.25);
  const y0 = Math.floor(cy - ry * 1.25);
  const y1 = Math.ceil(cy + ry * 1.25);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const u = (x + 0.5 - cx) / rx;
      let v = (y + 0.5 - cy) / ry;
      if (v < -1 + flat) v = -1 + flat + (v - (-1 + flat)) * 2.2; // flattened top
      const th = Math.atan2(v, u);
      const d = Math.hypot(u, v) / radius(th, seed);
      if (d > 1) continue;
      let maxS = 0;
      let face = -1;
      let cut = false;
      for (let i = 0; i < planes.length; i++) {
        const sp = (u * planes[i].nx + v * planes[i].ny) / planes[i].p;
        if (sp > 1) { cut = true; break; }
        if (sp > maxS) { maxS = sp; face = i; }
      }
      if (cut) continue;
      const nx = Math.cos(th);
      const ny = Math.sin(th);
      let t: number;
      let lit: number;
      const broad = (valueNoise(x / (rx * 0.9), y / (ry * 0.9), seed ^ 0x21) - 0.5) * 0.16;
      if (face >= 0 && maxS > 0.78 && maxS >= d * 0.98) {
        // Flat chiselled face: one tone per face (+ lit edge where it meets the rim).
        const f = planes[face];
        const k = 0.75;
        const pz = Math.sqrt(1 - k * k);
        const l = f.nx * k * -0.55 + f.ny * k * -0.72 + pz * 0.42 + broad;
        t = l > 0.55 ? 4 : l > 0.36 ? 3 : l > 0.12 ? 2 : l > -0.1 ? 1 : 0;
        lit = f.nx * -0.55 + f.ny * -0.72;
        if (maxS > 0.97) t = lit > 0.2 ? 4 : lit < -0.2 ? 0 : t;
        else if (maxS < 0.81) t = Math.max(0, t - 1); // crease where face meets body
      } else {
        t = pillowTone(nx, ny, Math.pow(d, 1.6), broad);
        lit = nx * LX + ny * LY;
        if (d > 0.93) t = lit > 0.25 ? 4 : lit < -0.15 ? 0 : t;
      }
      t = Math.max(0, t - dim);
      put(c, x, y, pal[t]);
    }
  }
  // Deliberate cracks: curved lines from the rim toward the centre, with a lit lip.
  const n = o.cracks ?? (hash01(cx, cy, seed) > 0.5 ? 1 : 0);
  for (let k = 0; k < n; k++) {
    const a = -0.6 + hash01(k, 3, seed) * 1.2 + (hash01(k, 4, seed) > 0.5 ? Math.PI : 0);
    const len = 0.45 + hash01(k, 5, seed) * 0.3;
    const bend = (hash01(k, 6, seed) - 0.5) * 0.6;
    for (let s = 0; s < 1; s += 1 / Math.max(rx, ry)) {
      const rr = 0.92 - s * len;
      const aa = a + bend * s;
      const x = Math.round(cx + Math.cos(aa) * rx * rr);
      const y = Math.round(cy + Math.sin(aa) * ry * rr);
      put(c, x, y, pal[0]);
      put(c, x - 1, y, pal[Math.max(0, 3 - dim)]);
    }
  }
}

export interface Ledge {
  x: number;
  y: number;
  w: number;
}

/**
 * Cliff formation (shape grammar): a main mass of stacked boulders whose
 * width narrows with height, a secondary outcrop on one side, rubble at the
 * foot. Lower boulders are drawn last so they overlap the ones above, like
 * hand-placed rock. Returns ledges (tops of boulders) for vegetation.
 */
export function formation(c: Canvas, x: number, baseY: number, width: number, height: number, pal: Pal5, seed: number, dim = 0): Ledge[] {
  const ledges: Ledge[] = [];
  const rows = Math.max(2, Math.round(height / (width * 0.42)));
  const rowH = height / rows;
  // Draw top rows first, bottom rows last (overlap).
  for (let r = rows - 1; r >= 0; r--) {
    const t = r / rows;
    const rowW = width * (1 - t * 0.55) * (0.9 + hash01(r, 1, seed) * 0.2);
    const n = rowW > width * 0.6 && hash01(r, 2, seed) > 0.35 ? 2 : 1;
    const cy = baseY - rowH * (r + 0.55);
    for (let i = 0; i < n; i++) {
      const bw = (rowW / n) * (0.62 + hash01(r * 7 + i, 3, seed) * 0.18);
      const bx = x - rowW / 2 + (rowW / n) * (i + 0.5) + (hash01(r * 7 + i, 4, seed) - 0.5) * bw * 0.35;
      const bh = rowH * (0.72 + hash01(r * 7 + i, 5, seed) * 0.25);
      boulder(c, bx, cy, bw, bh, pal, seed + r * 31 + i, { flatTop: 0.3 + hash01(r, 6, seed) * 0.25, dim });
      ledges.push({ x: bx, y: cy - bh * 0.78, w: bw * 1.2 });
    }
  }
  // Secondary outcrop leaning on one side.
  const side = hash01(x, 8, seed) > 0.5 ? 1 : -1;
  const sw = width * 0.32;
  const sh = height * (0.3 + hash01(x, 9, seed) * 0.25);
  boulder(c, x + side * width * 0.55, baseY - sh * 0.5, sw, sh * 0.5, pal, seed ^ 0x51, { flatTop: 0.35, dim: dim + 1 });
  ledges.push({ x: x + side * width * 0.55, y: baseY - sh * 0.9, w: sw });
  // Rubble at the foot.
  const rubble = 3 + Math.floor(hash01(x, 10, seed) * 4);
  for (let k = 0; k < rubble; k++) {
    const rx = width * (0.07 + hash01(k, 11, seed) * 0.08);
    const px = x + (hash01(k, 12, seed) - 0.5) * width * 1.5;
    boulder(c, px, baseY - rx * 0.45, rx, rx * 0.6, pal, seed ^ (k * 97), { flatTop: 0.2, cracks: 0, dim });
  }
  return ledges;
}

/**
 * Distant mountain silhouettes: smooth, low-contrast, two tones per face
 * (lit left-facing slopes, shaded right-facing) and a thin lit crest.
 * Deliberately simple — detail density increases toward the camera.
 */
export function softMountains(c: Canvas, baseY: number, maxH: number, pal: readonly [number, number, number, number], seed: number): void {
  const W = c.w;
  const raw = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    let h = 0;
    for (let k = 1; k <= 4; k++) {
      const f = [2, 3, 5, 9][k - 1];
      h += (Math.sin((x / W) * Math.PI * 2 * f + hash01(k, 1, seed) * 6.28) * 0.5 + 0.5) ** 1.6 / k;
    }
    raw[x] = h / 2.08;
  }
  const top = new Float32Array(W);
  for (let x = 0; x < W; x++) top[x] = baseY - raw[x] * maxH;
  for (let x = 0; x < W; x++) {
    const ty = Math.floor(top[x]);
    const slope = top[(x + 8) % W] - top[(x - 8 + W) % W];
    const lit = slope > 1;
    for (let y = Math.max(0, ty); y < c.h; y++) {
      const d = y - ty;
      let t = lit ? 2 : 1;
      if (d < 2) t = lit ? 3 : 2;
      // Large shadow masses in the valleys (clustered, from a smooth field).
      if (!lit && valueNoise(x / 60, y / 40, seed ^ 0x33) > 0.6) t = 0;
      put(c, x, y, pal[t]);
    }
  }
}
