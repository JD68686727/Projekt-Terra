import { BufferImageSource, Container, Sprite, Texture, TilingSprite } from 'pixi.js';
import { SKY_FRACTION } from '../world/generator';
import { fbm, hash01, valueNoise } from '../world/rng';

/**
 * Everything behind the terrain, all hand-built pixel art generated from the
 * seed: dithered sky gradient, twinkling stars, a banded gas giant, two
 * parallax mountain ridges and a detailed cave back-wall with props.
 * One texel = one cell, like the terrain, so pixel density stays consistent.
 */
export class Backdrop {
  readonly container = new Container();
  private readonly far = new Container(); // parallax 0.15
  private readonly mid = new Container(); // parallax 0.35
  private readonly near = new Container(); // parallax 0.6
  private readonly stars: Sprite[] = [];
  private time = 0;

  constructor(private readonly width: number, private readonly height: number, private readonly seed: number) {
    const skyH = Math.ceil(height * SKY_FRACTION + 120);
    this.container.addChild(this.sky(skyH), this.far, this.mid, this.near);
    this.far.addChild(this.planet());
    this.buildStars(skyH);
    this.mid.addChild(this.ridge(0x1a1030, 0x2a1a48, 0.55, 0x9a1, 70));
    this.near.addChild(this.ridge(0x120c22, 0x221636, 0.35, 0x9b2, 40));
  }

  private tex(w: number, h: number, px: Uint8Array): Texture {
    return new Texture({ source: new BufferImageSource({ resource: px, width: w, height: h, scaleMode: 'nearest', autoGenerateMipmaps: false }) });
  }

  /** Vertical gradient quantised into bands and Bayer-dithered between them. */
  private sky(h: number): TilingSprite {
    const w = 8; // stretched horizontally — gradient is vertical only
    const px = new Uint8Array(w * h * 4);
    const top = [7, 9, 22];
    const bottom = [52, 24, 70];
    const bands = 9;
    const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    for (let y = 0; y < h; y++) {
      const t = (y / h) * (bands - 1);
      const b0 = Math.floor(t);
      for (let x = 0; x < w; x++) {
        const b = b0 + ((t - b0) * 16 > bayer[((y & 3) << 2) | (x & 3)] ? 1 : 0);
        const k = b / (bands - 1);
        const p = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) px[p + c] = top[c] + (bottom[c] - top[c]) * k;
        px[p + 3] = 255;
      }
    }
    // Tiled (not stretched) so the dither keeps one texel per cell.
    const s = new TilingSprite({ texture: this.tex(w, h, px), width: this.width * 3, height: h });
    s.x = -this.width;
    s.y = -120;
    return s;
  }

  private buildStars(skyH: number): void {
    for (let i = 0; i < 220; i++) {
      const bright = hash01(i, 4, this.seed) > 0.9;
      const s = new Sprite(Texture.WHITE);
      s.width = s.height = bright ? 1 : 0.5;
      s.tint = hash01(i, 5, this.seed) > 0.7 ? 0xffd9a8 : 0xc8dcff;
      // Concentrated in the band of sky that is actually on screen near the horizon.
      s.x = (hash01(i, 1, this.seed) * 1.6 - 0.3) * this.width;
      s.y = this.height * SKY_FRACTION - 20 - Math.pow(hash01(i, 2, this.seed), 0.7) * (skyH * 0.6);
      s.alpha = 0.3 + hash01(i, 3, this.seed) * 0.7;
      this.far.addChild(s);
      this.stars.push(s);
    }
  }

  /** Banded gas giant with a crescent terminator and a thin ring. */
  private planet(): Sprite {
    const r = 22;
    const size = r * 2 + 16;
    const px = new Uint8Array(size * size * 4);
    const pal = [[34, 16, 52], [60, 28, 82], [96, 46, 112], [138, 74, 138], [176, 108, 154]];
    const c = size / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x + 0.5 - c;
        const dy = y + 0.5 - c;
        const p = (y * size + x) * 4;
        const d = Math.hypot(dx, dy);
        // Ring: thin tilted ellipse; the lower half passes in front of the disc.
        const ca = Math.cos(-0.28);
        const sa = Math.sin(-0.28);
        const u = dx * ca + dy * sa;
        const v = -dx * sa + dy * ca;
        const e = (u / (r * 1.55)) ** 2 + (v / (r * 0.32)) ** 2;
        const onRing = Math.abs(e - 1) < 0.16;
        const ry = v;
        if (d <= r) {
          const band = valueNoise(0, (dy + 30) / 3.5, this.seed ^ 0x9a) * 2 + (fbm(dx / 9, dy / 3, this.seed ^ 0x9b, 2) - 0.5);
          const light = (-dx * 0.6 - dy * 0.8) / r; // lit from top-left
          let step = Math.round(1.5 + band + light * 1.6);
          if (d > r - 1) step -= 1; // dark rim
          step = Math.max(0, Math.min(4, step));
          if (onRing && ry > 0) step = 3; // ring passes in front on the lower half
          const col = pal[step];
          px[p] = col[0];
          px[p + 1] = col[1];
          px[p + 2] = col[2];
          px[p + 3] = 255;
        } else if (onRing) {
          const inner = e < 1;
          px[p] = inner ? 150 : 118;
          px[p + 1] = inner ? 104 : 80;
          px[p + 2] = inner ? 136 : 116;
          px[p + 3] = 255;
        }
      }
    }
    const s = new Sprite(this.tex(size, size, px));
    s.x = this.width / 2 + 18 + hash01(1, 99, this.seed) * 20;
    s.y = this.height * SKY_FRACTION - 82;
    return s;
  }

  /** Mountain silhouette strip with a lit rim, placed at the horizon. */
  private ridge(body: number, rim: number, amp: number, salt: number, rise: number): Sprite {
    const w = Math.floor(this.width * 1.8);
    const h = rise + 40;
    const px = new Uint8Array(w * h * 4);
    const br = (body >> 16) & 255, bg = (body >> 8) & 255, bb = body & 255;
    const rr = (rim >> 16) & 255, rg = (rim >> 8) & 255, rb = rim & 255;
    for (let x = 0; x < w; x++) {
      const n = fbm(x / 60, 0.3, this.seed ^ salt, 4);
      const top = Math.floor(h - 10 - n * rise * amp * 1.8);
      for (let y = Math.max(0, top); y < h; y++) {
        const p = (y * w + x) * 4;
        const isRim = y <= top + 1 && hash01(x, y, salt) > 0.25;
        px[p] = isRim ? rr : br;
        px[p + 1] = isRim ? rg : bg;
        px[p + 2] = isRim ? rb : bb;
        px[p + 3] = 255;
      }
    }
    const s = new Sprite(this.tex(w, h, px));
    s.x = -this.width * 0.4;
    s.y = this.height * SKY_FRACTION - h + 18;
    return s;
  }

  /** Parallax + star twinkle. cam = camera centre in world cells. */
  update(dt: number, camX: number, camY: number): void {
    this.time += dt;
    const set = (c: Container, f: number) => {
      c.x = camX * (1 - f) - this.width * (1 - f) * 0.5;
      c.y = camY * (1 - f) * 0.35 - this.height * SKY_FRACTION * (1 - f) * 0.35;
    };
    set(this.far, 0.15);
    set(this.mid, 0.4);
    set(this.near, 0.65);
    // Twinkle ~ every star, cheap sine.
    for (let i = 0; i < this.stars.length; i += 1) {
      const s = this.stars[i];
      s.alpha = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(this.time * (0.7 + (i % 7) * 0.3) + i));
    }
  }
}
