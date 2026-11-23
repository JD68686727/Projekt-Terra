import { Container, Graphics, Sprite, Texture } from 'pixi.js';

/**
 * Depth darkness with a soft light around the rig. Darkness grows with
 * depth below the surface; outside the light radius the world fades to
 * near-black. Effects (beams, particles, drone) are drawn above this layer
 * so they read as light sources.
 */
export class Lighting {
  readonly container = new Container();
  private readonly light: Sprite;
  private readonly frame = new Graphics();
  /** Light radius in cells. */
  radius = 64;

  constructor() {
    this.light = new Sprite(Lighting.makeLightTexture());
    this.light.anchor.set(0.5);
    this.container.addChild(this.light, this.frame);
    this.container.label = 'lighting';
  }

  /** Radial gradient: transparent centre → black rim, with stepped bands for a pixel-art feel. */
  private static makeLightTexture(): Texture {
    const size = 128;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2);
        // Quantised falloff (8 bands) reads like hand-placed light rings.
        const t = Math.min(1, Math.max(0, (d - 0.25) / 0.75));
        const a = Math.round(Math.pow(t, 1.4) * 8) / 8;
        img.data[(y * size + x) * 4 + 3] = Math.round(a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = Texture.from(c);
    tex.source.scaleMode = 'nearest';
    return tex;
  }

  /**
   * @param depth cells below the surface at the rig
   * @param bounds visible world rect [x0, y0, x1, y1]
   */
  update(rigX: number, rigY: number, depth: number, bounds: [number, number, number, number]): void {
    const alpha = Math.min(0.6, Math.max(0, (depth - 30) / 260));
    this.container.visible = alpha > 0.01;
    if (!this.container.visible) return;
    this.container.alpha = alpha;
    const d = this.radius * 2;
    this.light.position.set(rigX, rigY);
    this.light.width = d;
    this.light.height = d;
    // Solid black around the light sprite out to the screen edges.
    const [x0, y0, x1, y1] = bounds;
    const lx0 = rigX - this.radius;
    const ly0 = rigY - this.radius;
    const lx1 = rigX + this.radius;
    const ly1 = rigY + this.radius;
    const g = this.frame;
    g.clear();
    const pad = 4;
    if (ly0 > y0) g.rect(x0 - pad, y0 - pad, x1 - x0 + pad * 2, ly0 - y0 + pad);
    if (ly1 < y1) g.rect(x0 - pad, ly1, x1 - x0 + pad * 2, y1 - ly1 + pad);
    if (lx0 > x0) g.rect(x0 - pad, ly0, lx0 - x0 + pad, d);
    if (lx1 < x1) g.rect(lx1, ly0, x1 - lx1 + pad, d);
    g.fill(0x000000);
  }
}
