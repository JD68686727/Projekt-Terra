import { BufferImageSource, Container, Sprite, Texture, TilingSprite } from 'pixi.js';
import { SKY_FRACTION } from '../world/generator';
import { hash01, valueNoise } from '../world/rng';
import { Canvas, canvas, haze, hazeBand } from './backdrop/painters';
import { Pal5, boulder, formation, softMountains } from './art/rock';
import { Pal6, glowPlant, shrub, tree } from './art/foliage';
import { Planet } from './art/Planet';
import { shiftPixels } from './biome';

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

/** `smooth` = linear filtering, so slow parallax moves in sub-pixel steps instead of 1 px jumps (distant layers only). */
/** Hue shift of the current biome, applied to every backdrop texture. */
let hueShift = 0;

function tex(w: number, h: number, px: Uint8Array, smooth = false): Texture {
  shiftPixels(px, hueShift);
  return new Texture({ source: new BufferImageSource({ resource: px, width: w, height: h, scaleMode: smooth ? 'linear' : 'nearest', autoGenerateMipmaps: false }) });
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
  private readonly stars: Sprite[] = [];
  private time = 0;
  private planetArt!: Planet;
  private readonly horizon: number;

  constructor(private readonly width: number, height: number, private readonly seed: number, sky = 0) {
    hueShift = sky;
    this.horizon = height * SKY_FRACTION;
    const top = -160;
    const skyH = Math.ceil(this.horizon - top + 80);
    this.container.addChild(this.sky(top, skyH), this.far, this.mid, this.near, this.front);
    this.far.addChild(this.nebula(top));
    this.buildStars();
    this.planetArt = new Planet(24 * ART, this.seed, sky);
    const ps = this.planetArt.sprite;
    ps.scale.set(1 / ART);
    ps.x = this.width / 2 + 34 + hash01(1, 99, this.seed) * 20;
    ps.y = this.horizon - 75;
    this.far.addChild(ps, this.moon());
    this.mid.addChild(this.layerFarMountains());
    this.near.addChild(this.layerFormations(0xe1, 0.5, 62, 6, 16, 'secondary'));
    this.front.addChild(this.layerFormations(0xe2, 0.14, 58, 5, 6, 'mid'));
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
    const s = new TilingSprite({ texture: tex(w, H, px, true), width: this.width * 3 * ART, height: H });
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
    const s = new TilingSprite({ texture: tex(W, H, px, true), width: this.width * 3 * ART, height: H });
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
    for (let i = 0; i < 520; i++) {
      const kind = hash01(i, 4, this.seed);
      const s = kind > 0.955 ? new Sprite(cross) : new Sprite(Texture.WHITE);
      if (kind > 0.955) s.scale.set((kind > 0.99 ? 2 : 1) / ART);
      else s.width = s.height = (kind > 0.8 ? 2 : 1) / ART;
      s.tint = hash01(i, 5, this.seed) > 0.75 ? 0xffd9b0 : hash01(i, 6, this.seed) > 0.5 ? 0xc8dcff : 0xffffff;
      s.x = (hash01(i, 1, this.seed) * 1.8 - 0.4) * this.width;
      s.y = this.horizon - 15 - Math.pow(hash01(i, 2, this.seed), 0.8) * 170;
      this.far.addChild(s);
      this.stars.push(s);
    }
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
    const s = new Sprite(tex(size, size, px, true));
    s.scale.set(1 / ART);
    s.x = this.width / 2 - 70;
    s.y = this.horizon - 120;
    return s;
  }

  // --- Layered landscape (ref: hand-made parallax backgrounds) -----------
  // Palettes are pushed toward the horizon colour with distance
  // (atmospheric perspective): far layers are lighter and flatter.

  // Art direction palette: violet / lavender / deep indigo stone, teal + violet flora, luminous accents.
  private static readonly HAZE = 0x6a3a72;
  private static readonly ROCK: Pal5 = [0x0f0b18, 0x2b2340, 0x41365c, 0x5e5180, 0x8a7aa8];
  private static readonly LEAF_TEAL: Pal6 = [0x06110f, 0x0b2622, 0x123c34, 0x1c5a48, 0x2d8062, 0x5fbf8c];
  private static readonly LEAF_VIOLET: Pal6 = [0x0f0816, 0x241338, 0x3a1f55, 0x563178, 0x7a4c9c, 0xb084cc];
  private static readonly BARK = [0x140e1c, 0x2a1d36, 0x46324f];
  private static readonly GLOW = [0xb8fff0, 0x3ff0d0];

  /**
   * The layer plus a skirt: the bottom pixel row stretched downwards, so no gap/edge shows
   * between the layer and the terrain (valleys below the horizon, camera parallax moving up).
   */
  private layerSprite(c: Canvas, baseOffsetCells: number, smooth = false): Container {
    const root = new Container();
    // Average colour/alpha of the bottom row (the row itself is dithered).
    let r = 0, g = 0, bl = 0, al = 0, n = 0;
    const base = (c.h - 1) * c.w * 4;
    for (let x = 0; x < c.w; x++) {
      const a = c.px[base + x * 4 + 3];
      al += a;
      if (a > 0) { r += c.px[base + x * 4]; g += c.px[base + x * 4 + 1]; bl += c.px[base + x * 4 + 2]; n++; }
    }
    const fr = n ? r / n : 0, fg = n ? g / n : 0, fb = n ? bl / n : 0, fa = Math.round(al / c.w);
    // Feather the layer's last rows into that colour so there is no visible bottom edge.
    const FEATHER = 36 * ART;
    for (let y = c.h - FEATHER; y < c.h; y++) {
      const t0 = (y - (c.h - FEATHER)) / FEATHER;
      const t = t0 * t0 * (3 - 2 * t0);
      for (let x = 0; x < c.w; x++) {
        const p = (y * c.w + x) * 4;
        c.px[p] += (fr - c.px[p]) * t;
        c.px[p + 1] += (fg - c.px[p + 1]) * t;
        c.px[p + 2] += (fb - c.px[p + 2]) * t;
        c.px[p + 3] += (fa - c.px[p + 3]) * t;
      }
    }
    const s = new TilingSprite({ texture: tex(c.w, c.h, c.px, smooth), width: this.width * 3 * ART, height: c.h });
    s.scale.set(1 / ART);
    s.x = -this.width;
    s.y = this.horizon - c.h / ART + baseOffsetCells;
    // Skirt: continues the layer downwards, fading softly into deep fog (it blends with the terrain's dark depths).
    const GRAD = 512;
    const col = new Uint8Array(GRAD * 4);
    for (let y = 0; y < GRAD; y++) {
      const t0 = y / (GRAD - 1);
      const t = t0 * t0 * (3 - 2 * t0);
      col[y * 4] = fr + (0x14 - fr) * t;
      col[y * 4 + 1] = fg + (0x0b - fg) * t;
      col[y * 4 + 2] = fb + (0x20 - fb) * t;
      col[y * 4 + 3] = fa + (255 - fa) * t;
    }
    const GRAD_CELLS = 140;
    const grad = new Sprite(tex(1, GRAD, col, true));
    grad.x = s.x;
    grad.y = this.horizon + baseOffsetCells;
    grad.width = this.width * 3;
    grad.height = GRAD_CELLS;
    const solidPx = new Uint8Array([0x14, 0x0b, 0x20, 255]);
    const solid = new Sprite(tex(1, 1, solidPx));
    solid.x = s.x;
    solid.y = grad.y + GRAD_CELLS;
    solid.width = this.width * 3;
    solid.height = 1400;
    root.addChild(solid, grad, s);
    return root;
  }

  private layerFarMountains(): Container {
    const c = canvas(RIDGE_PERIOD * ART, 120 * ART);
    const p = haze(Backdrop.ROCK, Backdrop.HAZE, 0.62);
    softMountains(c, c.h - 2, 92 * ART, [p[1], p[2], p[3], p[4]], this.seed ^ 0xa1);
    hazeBand(c, Math.floor(c.h * 0.45), c.h, Backdrop.HAZE, 200);
    return this.layerSprite(c, 30, true);
  }

  /**
   * Rock formations with vegetation. 'secondary' = hazy, simplified (shrubs
   * only); 'mid' = full detail (trees, shrubs, glow plants).
   */
  private layerFormations(salt: number, hazeT: number, maxHCells: number, count: number, offset: number, kind: 'secondary' | 'mid'): Container {
    const c = canvas(RIDGE_PERIOD * ART, (maxHCells + 30) * ART);
    const seed = this.seed ^ salt;
    const rock = haze(Backdrop.ROCK, Backdrop.HAZE, hazeT) as unknown as Pal5;
    const teal = haze(Backdrop.LEAF_TEAL, Backdrop.HAZE, hazeT) as unknown as Pal6;
    const violet = haze(Backdrop.LEAF_VIOLET, Backdrop.HAZE, hazeT) as unknown as Pal6;
    const bark = haze(Backdrop.BARK, Backdrop.HAZE, hazeT);
    const base = c.h - 3 * ART;
    // Continuous foot: wide, low boulders tie the formations together.
    for (let x = 0; x < c.w; x += 30 * ART) {
      const w = (14 + hash01(x, 1, seed) * 10) * ART;
      boulder(c, x + hash01(x, 2, seed) * 12 * ART, base, w, (3 + hash01(x, 3, seed) * 3) * ART, rock, seed ^ x, { flatTop: 0.45, cracks: 0, dim: 1 });
    }
    const ledges: { x: number; y: number; w: number }[] = [];
    for (let k = 0; k < count; k++) {
      const x = ((k + 0.25 + hash01(k, 1, seed) * 0.5) / count) * c.w;
      const h = maxHCells * ART * (0.5 + hash01(k, 2, seed) * 0.5);
      const w = h * (0.42 + hash01(k, 3, seed) * 0.3);
      ledges.push(...formation(c, x, base, w, h, rock, seed + k * 131));
    }
    // Vegetation on ledges (tallest ledges get trees in the mid layer).
    ledges.sort((a, b) => a.y - b.y);
    ledges.forEach((l, i) => {
      const r = hash01(i, 5, seed);
      const pal = r > 0.7 ? violet : teal;
      if (kind === 'mid' && i % 2 === 0 && l.w > 8 * ART) {
        tree(c, Math.round(l.x), Math.round(l.y) + 2, (26 + hash01(i, 6, seed) * 14) * ART, pal, bark, seed ^ (i * 17));
      } else if (r > 0.25) {
        shrub(c, Math.round(l.x + (hash01(i, 7, seed) - 0.5) * l.w * 0.6), Math.round(l.y) + 2, Math.max(4 * ART, l.w * (0.25 + r * 0.2)), pal, seed ^ (i * 29));
      }
      if (kind === 'mid' && hash01(i, 8, seed) > 0.75) glowPlant(c, Math.round(l.x + l.w * 0.3), Math.round(l.y) + 1, 5 * ART, bark[1], Backdrop.GLOW, seed ^ i);
    });
    // Ground vegetation between formations.
    for (let x = 0; x < c.w; x += 22 * ART) {
      const r = hash01(x, 9, seed);
      if (r < 0.4) continue;
      shrub(c, x + Math.floor(hash01(x, 10, seed) * 18 * ART), base - 2 * ART, (3 + r * 4) * ART, r > 0.8 ? violet : teal, seed ^ (x * 3));
    }
    if (hazeT > 0.3) hazeBand(c, Math.floor(c.h * 0.55), c.h, Backdrop.HAZE, 170);
    else hazeBand(c, Math.floor(c.h * 0.78), c.h, 0x24142f, 110);
    return this.layerSprite(c, offset);
  }

  /** Parallax + star twinkle. camX/camY = camera centre in cells. */
  /**
   * `offX/offY` (world units) cancel the pixel-snapping of the scene so the parallax layers
   * move with the exact camera position rather than in whole-pixel jumps.
   */
  update(dt: number, camX: number, camY: number, offX = 0, offY = 0): void {
    this.time += dt;
    this.planetArt.update(dt);
    const place = (c: Container, f: number) => {
      c.x = (camX - this.width / 2) * (1 - f) + offX;
      c.y = (camY - this.horizon) * (1 - f) * 0.5 + offY;
    };
    place(this.far, 0.08);
    place(this.mid, 0.2);
    place(this.near, 0.45);
    place(this.front, 0.7);
    for (let i = 0; i < this.stars.length; i++) {
      this.stars[i].alpha = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(this.time * (0.6 + (i % 9) * 0.35) + i * 1.7));
    }
  }
}
