import { BufferImageSource, Container, Sprite, Texture, TilingSprite } from 'pixi.js';
import { SKY_FRACTION } from '../world/generator';
import { hash01, valueNoise } from '../world/rng';
import { Canvas, bush, canvas, haze, hazeBand, mesas, ridgedMountains } from './backdrop/painters';

/**
 * Sky & horizon, drawn at the same density as the HD terrain (ART art
 * pixels per cell). Layers, far → near: dithered sky gradient with horizon
 * glow, colour nebula, stars (with twinkling cross stars), ringed gas giant
 * + small cratered moon, three tileable mountain ridges with rim light,
 * strata and alien plant silhouettes. Everything derives from the seed.
 */
const ART = 4;
const RIDGE_PERIOD = 512; // cells; ridges tile horizontally

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number) => BAYER[((y & 3) << 2) | (x & 3)] / 16;

function tex(w: number, h: number, px: Uint8Array): Texture {
  return new Texture({ source: new BufferImageSource({ resource: px, width: w, height: h, scaleMode: 'nearest', autoGenerateMipmaps: false }) });
}

function set(px: Uint8Array, w: number, x: number, y: number, rgb: number, a = 255): void {
  const p = (y * w + x) * 4;
  px[p] = (rgb >> 16) & 255;
  px[p + 1] = (rgb >> 8) & 255;
  px[p + 2] = rgb & 255;
  px[p + 3] = a;
}

function mix(a: number, b: number, t: number): number {
  const r = ((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * t;
  const g = ((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * t;
  const bl = (a & 255) + ((b & 255) - (a & 255)) * t;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

export class Backdrop {
  readonly container = new Container();
  private readonly far = new Container(); // parallax 0.08
  private readonly mid = new Container(); // 0.3
  private readonly near = new Container(); // 0.55
  private readonly front = new Container(); // 0.7
  private readonly fore = new Container(); // 0.85
  private readonly stars: Sprite[] = [];
  private time = 0;
  private readonly horizon: number;

  constructor(private readonly width: number, height: number, private readonly seed: number) {
    this.horizon = height * SKY_FRACTION;
    const top = -160;
    const skyH = Math.ceil(this.horizon - top + 80);
    this.container.addChild(this.sky(top, skyH), this.far, this.mid, this.near, this.front, this.fore);
    this.far.addChild(this.nebula(top));
    this.buildStars();
    this.far.addChild(this.planet(), this.moon(), this.clouds());
    this.mid.addChild(this.layerMountains());
    this.near.addChild(this.layerMesas(0x0e1, 0.5, 62, 6, 26, false));
    this.front.addChild(this.layerMesas(0x0e2, 0.22, 48, 8, 24, true));
    this.fore.addChild(this.layerMesas(0x0e3, -0.3, 30, 9, 22, true));
  }

  private sky(top: number, h: number): TilingSprite {
    const w = 8;
    const H = h * ART;
    const px = new Uint8Array(w * H * 4);
    const stops = [0x05070f, 0x150c2a, 0x34184c, 0x5a2a5e];
    const bands = 14;
    for (let y = 0; y < H; y++) {
      const t = (y / H) * (bands - 1);
      const b0 = Math.floor(t);
      for (let x = 0; x < w; x++) {
        const b = Math.min(bands - 1, b0 + (t - b0 > bayer(x, y) ? 1 : 0));
        const k = (b / (bands - 1)) * (stops.length - 1);
        const i = Math.min(stops.length - 2, Math.floor(k));
        set(px, w, x, y, mix(stops[i], stops[i + 1], k - i));
      }
    }
    const s = new TilingSprite({ texture: tex(w, H, px), width: this.width * 3 * ART, height: H });
    s.scale.set(1 / ART);
    s.x = -this.width;
    s.y = top;
    return s;
  }

  /** Soft colour clouds, alpha quantised + dithered so they stay pixel art. */
  private nebula(top: number): TilingSprite {
    const cellsW = 384;
    const W = cellsW * ART;
    const H = 120 * ART;
    const px = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const u = x / W;
        // Periodic in x: blend noise sampled at u and u-1.
        const n0 = valueNoise((u * cellsW) / 40, y / ART / 22, this.seed ^ 0x4e);
        const n1 = valueNoise(((u - 1) * cellsW) / 40, y / ART / 22, this.seed ^ 0x4e);
        const n = n0 * (1 - u) + n1 * u;
        const fine = valueNoise(x / ART / 9, y / ART / 7, this.seed ^ 0x4f);
        const v = n * 0.75 + fine * 0.35 - 0.48;
        const fade = Math.sin((y / H) * Math.PI);
        const a = Math.max(0, v) * fade * 1.6;
        const q = Math.floor(a * 4 + bayer(x, y)) / 4; // 4 alpha steps, dithered
        if (q <= 0) continue;
        const col = mix(0x5b2a7a, 0x1f7a8a, valueNoise(x / ART / 60, y / ART / 30, this.seed ^ 0x50));
        set(px, W, x, y, col, Math.min(110, Math.round(q * 90)));
      }
    }
    const s = new TilingSprite({ texture: tex(W, H, px), width: this.width * 3 * ART, height: H });
    s.scale.set(1 / ART);
    s.x = -this.width;
    s.y = top + 20;
    return s;
  }

  private buildStars(): void {
    // Cross star texture (5×5 art px) for the brightest stars.
    const cpx = new Uint8Array(5 * 5 * 4);
    const pts: [number, number, number][] = [
      [2, 2, 0xffffff], [1, 2, 0x9fb8ff], [3, 2, 0x9fb8ff], [2, 1, 0x9fb8ff], [2, 3, 0x9fb8ff],
      [0, 2, 0x4a5a90], [4, 2, 0x4a5a90], [2, 0, 0x4a5a90], [2, 4, 0x4a5a90],
    ];
    for (const [x, y, c] of pts) set(cpx, 5, x, y, c);
    const cross = tex(5, 5, cpx);
    for (let i = 0; i < 420; i++) {
      const kind = hash01(i, 4, this.seed);
      const s = kind > 0.965 ? new Sprite(cross) : new Sprite(Texture.WHITE);
      if (kind > 0.965) s.scale.set(1 / ART);
      else s.width = s.height = (kind > 0.8 ? 2 : 1) / ART;
      s.tint = hash01(i, 5, this.seed) > 0.75 ? 0xffd9b0 : hash01(i, 6, this.seed) > 0.5 ? 0xc8dcff : 0xffffff;
      s.x = (hash01(i, 1, this.seed) * 1.8 - 0.4) * this.width;
      s.y = this.horizon - 15 - Math.pow(hash01(i, 2, this.seed), 0.8) * 170;
      this.far.addChild(s);
      this.stars.push(s);
    }
  }

  /** Banded gas giant: turbulent bands, dithered terminator, atmosphere rim, storm, ring with a gap. */
  private planet(): Sprite {
    const r = 24 * ART;
    const ringA = r * 1.7;
    const size = Math.ceil(ringA * 2 + 8);
    const px = new Uint8Array(size * size * 4);
    const c = size / 2;
    const pal = [0x1a0b2a, 0x2e1446, 0x481f58, 0x652c6e, 0x84417e, 0xa45e90, 0xc283a4];
    const ca = Math.cos(-0.3);
    const sa = Math.sin(-0.3);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x + 0.5 - c;
        const dy = y + 0.5 - c;
        const d = Math.hypot(dx, dy);
        const u = dx * ca + dy * sa;
        const v = -dx * sa + dy * ca;
        const e = (u / ringA) ** 2 + (v / (r * 0.34)) ** 2;
        const inRing = e > 0.72 && e < 1.02 && !(e > 0.84 && e < 0.88); // Cassini-like gap
        const ringFront = inRing && v > 0;
        if (d <= r && !ringFront) {
          const lat = dy / r;
          const turb = valueNoise(dx / 30, dy / 9, this.seed ^ 0x9a) * 1.4 + valueNoise(dx / 12, dy / 5, this.seed ^ 0x9b) * 0.25;
          const band = (Math.sin(lat * 9 + turb * 2.2) * 0.5 + 0.5) * 2.4;
          const nx = dx / r;
          const ny = dy / r;
          const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
          const light = Math.max(0, -nx * 0.55 - ny * 0.45 + nz * 0.7);
          let step = Math.floor(band + light * 3.2 + bayer(x, y) * 0.9);
          if (d > r - ART) step += 1; // atmosphere rim
          const sx = dx - r * 0.25;
          const sy = dy - r * 0.32;
          if ((sx / (r * 0.16)) ** 2 + (sy / (r * 0.08)) ** 2 < 1) step += 1; // storm
          set(px, size, x, y, pal[Math.max(0, Math.min(pal.length - 1, step))]);
        } else if (inRing) {
          if (!ringFront && d < r + 2) continue; // hidden right behind the disc
          const t = (e - 0.72) / 0.3;
          const col = mix(0xb88aa8, 0x6e4a78, t);
          set(px, size, x, y, mix(0x1a1026, col, (ringFront ? 1 : 0.8) * (0.75 + 0.25 * bayer(x, y))));
        }
      }
    }
    const s = new Sprite(tex(size, size, px));
    s.scale.set(1 / ART);
    s.anchor.set(0.5);
    s.x = this.width / 2 + 34 + hash01(1, 99, this.seed) * 20;
    s.y = this.horizon - 75;
    return s;
  }

  private moon(): Sprite {
    const r = 5 * ART;
    const size = r * 2 + 2;
    const px = new Uint8Array(size * size * 4);
    const c = size / 2;
    const pal = [0x2a2836, 0x4a4658, 0x6e6a80, 0x9a96aa, 0xc8c4d6];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x + 0.5 - c;
        const dy = y + 0.5 - c;
        if (dx * dx + dy * dy > r * r) continue;
        const light = (-dx / r) * 0.7 - (dy / r) * 0.4 + 0.3;
        let step = Math.floor(2 + light * 2 + bayer(x, y) * 0.8);
        if (valueNoise(dx / 3, dy / 3, this.seed ^ 0x77) > 0.72) step -= 1; // craters
        set(px, size, x, y, pal[Math.max(0, Math.min(4, step))]);
      }
    }
    const s = new Sprite(tex(size, size, px));
    s.scale.set(1 / ART);
    s.x = this.width / 2 - 70;
    s.y = this.horizon - 120;
    return s;
  }

  // --- Layered landscape (ref: hand-made parallax backgrounds) -----------
  // Palettes are pushed toward the horizon colour with distance
  // (atmospheric perspective): far layers are lighter and flatter.

  private static readonly HAZE = 0x6a3a72;
  private static readonly DARK = 0x0a0816;
  private static readonly ROCK = [0x0e0b16, 0x2a2438, 0x433a56, 0x5f5576, 0x8a7fa0];
  private static readonly LEAF = [0x061412, 0x0d302c, 0x154c42, 0x206a58, 0x3c9478];
  private static readonly GLOW = [0xb8fff0, 0x3ff0d0];
  private static readonly CLOUD = [0x3a2050, 0x4e2e66, 0x63407a, 0x7a5590, 0x9572a6];

  private layerSprite(c: Canvas, baseOffsetCells: number): TilingSprite {
    const s = new TilingSprite({ texture: tex(c.w, c.h, c.px), width: this.width * 3 * ART, height: c.h });
    s.scale.set(1 / ART);
    s.x = -this.width;
    s.y = this.horizon - c.h / ART + baseOffsetCells;
    return s;
  }

  private layerMountains(): TilingSprite {
    const c = canvas(RIDGE_PERIOD * ART, 130 * ART);
    ridgedMountains(c, c.h - 4 * ART, 90 * ART, haze(Backdrop.ROCK, Backdrop.HAZE, 0.55), this.seed ^ 0xa1, RIDGE_PERIOD);
    hazeBand(c, Math.floor(c.h * 0.5), c.h, Backdrop.HAZE, 210);
    return this.layerSprite(c, 26);
  }

  /** Mesa layer. hazeT > 0 → toward horizon haze (far), < 0 → darker (nearest). */
  private layerMesas(salt: number, hazeT: number, maxHCells: number, count: number, offset: number, bushes: boolean): TilingSprite {
    const c = canvas(RIDGE_PERIOD * ART, (maxHCells + 18) * ART);
    const tone = (p: readonly number[]) => (hazeT >= 0 ? haze(p, Backdrop.HAZE, hazeT) : haze(p, Backdrop.DARK, -hazeT));
    mesas(c, c.h - 2, tone(Backdrop.ROCK), this.seed ^ salt, {
      count,
      maxH: maxHCells * ART,
      facet: hazeT > 0.4 ? 30 : 24,
      strata: hazeT > 0.4 ? 22 : 18,
      leaf: tone(Backdrop.LEAF),
      glow: hazeT < 0.3 ? Backdrop.GLOW : null,
      bushes,
    });
    if (hazeT > 0) hazeBand(c, Math.floor(c.h * 0.5), c.h, Backdrop.HAZE, Math.round(110 + hazeT * 140));
    else hazeBand(c, Math.floor(c.h * 0.72), c.h, 0x1a1028, 120);
    return this.layerSprite(c, offset);
  }

  /** Volumetric clouds: clusters of shaded puffs (same technique as the bushes) on a flat base. */
  private clouds(): Container {
    const layer = new Container();
    const c = canvas(RIDGE_PERIOD * ART, 50 * ART);
    for (let i = 0; i < 7; i++) {
      const x = Math.floor(hash01(i, 1, this.seed ^ 0xc1d) * c.w);
      const y = Math.floor((30 + hash01(i, 2, this.seed ^ 0xc1d) * 12) * ART);
      const w = (14 + hash01(i, 3, this.seed ^ 0xc1d) * 16) * ART;
      const puffs = 3 + Math.floor(hash01(i, 4, this.seed ^ 0xc1d) * 3);
      for (let p = 0; p < puffs; p++) {
        const px = Math.floor(x - w / 2 + (w * (p + 0.5)) / puffs);
        const r = Math.floor((w / puffs) * (0.8 + hash01(p, i, this.seed) * 0.5));
        bush(c, px, y - Math.floor(r * (p === Math.floor(puffs / 2) ? 0.5 : 0.1)), r, Backdrop.CLOUD, this.seed ^ (i * 31 + p));
      }
      // Flat base: clip everything below the base line.
      for (let yy = y + 2; yy < c.h; yy++) for (let xx = Math.floor(x - w); xx < x + w; xx++) {
        const q = ((yy * c.w + (((xx % c.w) + c.w) % c.w)) * 4);
        c.px[q + 3] = 0;
      }
    }
    const s = new TilingSprite({ texture: tex(c.w, c.h, c.px), width: this.width * 3 * ART, height: c.h });
    s.scale.set(1 / ART);
    s.x = -this.width;
    s.y = this.horizon - 78;
    s.alpha = 0.8;
    layer.addChild(s);
    return layer;
  }

  /** Parallax + star twinkle. camX/camY = camera centre in cells. */
  update(dt: number, camX: number, camY: number): void {
    this.time += dt;
    const place = (c: Container, f: number) => {
      c.x = (camX - this.width / 2) * (1 - f);
      c.y = (camY - this.horizon) * (1 - f) * 0.5;
    };
    place(this.far, 0.08);
    place(this.mid, 0.2);
    place(this.near, 0.45);
    place(this.front, 0.7);
    place(this.fore, 0.85);
    for (let i = 0; i < this.stars.length; i++) {
      this.stars[i].alpha = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(this.time * (0.6 + (i % 9) * 0.35) + i * 1.7));
    }
  }
}
