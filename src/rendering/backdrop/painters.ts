
/**
 * Low-level pixel canvas helpers shared by the art kits (art/rock.ts,
 * art/foliage.ts) and the backdrop. Canvases tile horizontally (x wraps).
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
