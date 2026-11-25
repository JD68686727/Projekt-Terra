import { BufferImageSource, Sprite, Texture } from 'pixi.js';
import { hash01, valueNoise } from '../../world/rng';

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number) => BAYER[((y & 3) << 2) | (x & 3)] / 16;

/**
 * Rotating ringed gas giant.
 *
 * The sphere projection is precomputed once per pixel (longitude, latitude,
 * lighting, rim); bands live in an equirectangular map that wraps in
 * longitude. Rotating = shifting the longitude offset and re-sampling the
 * disc (a few ten-thousand table lookups) at a low rate. The ring stores an
 * angular parameter per pixel, so clumps in the ring orbit as well.
 */
export class Planet {
  readonly sprite: Sprite;
  private readonly size: number;
  private readonly px: Uint8Array;
  private readonly source: BufferImageSource;
  // Per-pixel precomputed data (-1 = empty).
  private readonly kind: Int8Array; // 0 empty, 1 disc, 2 ring
  private readonly lonF: Float32Array; // fractional map column per pixel
  private readonly latIdx: Int16Array;
  private readonly light: Float32Array;
  private readonly ringT: Float32Array;
  private readonly ringA: Float32Array; // fractional ring index per pixel
  private readonly ringFront: Uint8Array;
  private readonly bands: Float32Array; // MAP_W × MAP_H
  private readonly ringMap: Float32Array; // RING_N
  private lonOffset = 0;
  private ringOffset = 0;
  private acc = 0;

  private static readonly MAP_W = 512;
  private static readonly MAP_H = 96;
  private static readonly RING_N = 1024;
  private static readonly PAL = [0x1a0b2a, 0x2e1446, 0x481f58, 0x652c6e, 0x84417e, 0xa45e90, 0xc283a4];

  constructor(r: number, seed: number) {
    const ringA = r * 1.7;
    const size = Math.ceil(ringA * 2 + 8);
    this.size = size;
    const n = size * size;
    this.px = new Uint8Array(n * 4);
    this.kind = new Int8Array(n);
    this.lonF = new Float32Array(n);
    this.latIdx = new Int16Array(n);
    this.light = new Float32Array(n);
    this.ringT = new Float32Array(n);
    this.ringA = new Float32Array(n);
    this.ringFront = new Uint8Array(n);

    // Equirectangular band map, periodic in longitude.
    const MW = Planet.MAP_W;
    const MH = Planet.MAP_H;
    this.bands = new Float32Array(MW * MH);
    for (let y = 0; y < MH; y++) {
      const lat = (y / (MH - 1)) * 2 - 1;
      for (let x = 0; x < MW; x++) {
        const a = (x / MW) * Math.PI * 2;
        // Sample noise on a circle → seamless wrap.
        const cx = Math.cos(a) * 3;
        const cy = Math.sin(a) * 3;
        const turb = valueNoise(cx + 10, cy + y / 9, seed ^ 0x9a) * 1.3 + valueNoise(cx * 2 + 20, cy * 2 + y / 5, seed ^ 0x9b) * 0.3;
        let band = (Math.sin(lat * 9 + turb * 2.2) * 0.5 + 0.5) * 2.4;
        // Great storm: an oval at fixed longitude/latitude.
        const da = Math.atan2(Math.sin(a - 1.2), Math.cos(a - 1.2));
        if ((da / 0.35) ** 2 + ((lat - 0.32) / 0.08) ** 2 < 1) band += 1.1;
        this.bands[y * MW + x] = band;
      }
    }
    this.ringMap = new Float32Array(Planet.RING_N);
    for (let i = 0; i < Planet.RING_N; i++) {
      const a = (i / Planet.RING_N) * Math.PI * 2;
      this.ringMap[i] = valueNoise(Math.cos(a) * 6 + 30, Math.sin(a) * 6, seed ^ 0xa7) * 0.6 + hash01(i >> 4, 1, seed) * 0.25;
    }

    const c = size / 2;
    const ca = Math.cos(-0.3);
    const sa = Math.sin(-0.3);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const dx = x + 0.5 - c;
        const dy = y + 0.5 - c;
        const d = Math.hypot(dx, dy);
        const u = dx * ca + dy * sa;
        const v = -dx * sa + dy * ca;
        const e = (u / ringA) ** 2 + (v / (r * 0.34)) ** 2;
        const inRing = e > 0.72 && e < 1.02 && !(e > 0.84 && e < 0.88);
        const front = inRing && v > 0;
        if (d <= r && !front) {
          const nx = dx / r;
          const ny = dy / r;
          const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
          this.kind[i] = 1;
          const lon = Math.atan2(nx, nz); // −π/2..π/2 on the visible side
          const lat = Math.asin(Math.max(-1, Math.min(1, ny)));
          this.lonF[i] = ((lon / (Math.PI * 2)) + 1) * MW;
          this.latIdx[i] = Math.max(0, Math.min(MH - 1, Math.round(((lat / (Math.PI / 2)) * 0.5 + 0.5) * (MH - 1))));
          let l = Math.max(0, -nx * 0.55 - ny * 0.45 + nz * 0.7) * 3.2 + bayer(x, y) * 0.9;
          if (d > r - 4) l += 1; // atmosphere rim
          this.light[i] = l;
        } else if (inRing && !(d < r + 2 && !front)) {
          this.kind[i] = 2;
          this.ringT[i] = (e - 0.72) / 0.3;
          this.ringA[i] = ((Math.atan2(v / 0.34, u) / (Math.PI * 2)) + 1) * Planet.RING_N;
          this.ringFront[i] = front ? 1 : 0;
        }
      }
    }
    this.source = new BufferImageSource({ resource: this.px, width: size, height: size, scaleMode: 'linear', autoGenerateMipmaps: false });
    this.sprite = new Sprite(new Texture({ source: this.source }));
    this.sprite.anchor.set(0.5);
    this.redraw();
  }

  private redraw(): void {
    const { size, px } = this;
    const MW = Planet.MAP_W;
    const pal = Planet.PAL;
    const RN = Planet.RING_N;
    const lo = this.lonOffset;
    const ro = this.ringOffset;
    for (let i = 0; i < size * size; i++) {
      const k = this.kind[i];
      if (k === 0) continue;
      let col: number;
      if (k === 1) {
        // Sub-column linear sampling: bands (and so the palette steps) shift smoothly, pixel by pixel.
        const u = this.lonF[i] + lo;
        const u0 = Math.floor(u);
        const f = u - u0;
        const row = this.latIdx[i] * MW;
        const a = this.bands[row + (u0 % MW)];
        const band = a + (this.bands[row + ((u0 + 1) % MW)] - a) * f;
        const step = Math.max(0, Math.min(pal.length - 1, Math.floor(band + this.light[i])));
        col = pal[step];
      } else {
        const t = this.ringT[i];
        const w = this.ringA[i] + ro;
        const w0 = Math.floor(w);
        const c0 = this.ringMap[w0 % RN];
        const clump = c0 + (this.ringMap[(w0 + 1) % RN] - c0) * (w - w0);
        const base = 0.55 + clump * 0.6 - t * 0.25;
        const shade = (this.ringFront[i] ? 1 : 0.8) * base;
        const r = Math.min(255, 26 + 150 * shade);
        const g = Math.min(255, 16 + 105 * shade);
        const b = Math.min(255, 38 + 130 * shade);
        col = (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
      }
      const p = i * 4;
      px[p] = (col >> 16) & 255;
      px[p + 1] = (col >> 8) & 255;
      px[p + 2] = col & 255;
      px[p + 3] = 255;
    }
    this.source.update();
  }

  /** Slow rotation: the disc turns ~once per 3 minutes, the ring a bit faster. */
  update(dt: number): void {
    this.acc += dt;
    if (this.acc < 0.04) return; // ~25 Hz: with sub-pixel sampling this reads as smooth motion
    this.lonOffset = (this.lonOffset + this.acc * (Planet.MAP_W / 180)) % Planet.MAP_W;
    this.ringOffset = (this.ringOffset + this.acc * (Planet.RING_N / 120)) % Planet.RING_N;
    this.acc = 0;
    this.redraw();
  }
}
