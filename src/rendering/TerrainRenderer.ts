import { BufferImageSource, Container, Sprite, Texture } from 'pixi.js';
import { CHUNK_SIZE, Chunk, World } from '../world/World';
import { MATERIALS, Mat } from '../world/materials';
import { hash01 } from '../world/rng';

interface ChunkView {
  chunk: Chunk;
  pixels: Uint8Array;
  source: BufferImageSource;
  sprite: Sprite;
}

export interface TerrainRenderStats {
  /** Chunks re-coloured & uploaded in the last frame. */
  uploads: number;
  /** Texels uploaded in the last frame. */
  texels: number;
  /** CPU ms spent recolouring + scheduling uploads in the last frame. */
  ms: number;
  visible: number;
}

// Precomputed per-material RGB components.
const BASE_R = new Float32Array(MATERIALS.length);
const BASE_G = new Float32Array(MATERIALS.length);
const BASE_B = new Float32Array(MATERIALS.length);
for (const m of MATERIALS) {
  BASE_R[m.id] = (m.color >> 16) & 0xff;
  BASE_G[m.id] = (m.color >> 8) & 0xff;
  BASE_B[m.id] = m.color & 0xff;
}

/**
 * One RGBA buffer texture per 64×64 chunk. Only dirty rows are recoloured,
 * and only that texel range is re-uploaded (texSubImage2D under WebGL).
 * Sprites outside the camera view are hidden (culled).
 */
export class TerrainRenderer {
  readonly container = new Container();
  readonly stats: TerrainRenderStats = { uploads: 0, texels: 0, ms: 0, visible: 0 };
  private readonly views: ChunkView[] = [];
  private readonly world: World;

  constructor(world: World) {
    this.world = world;
    this.container.label = 'terrain';
    for (const chunk of world.chunks) {
      const pixels = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * 4);
      const source = new BufferImageSource({
        resource: pixels,
        width: CHUNK_SIZE,
        height: CHUNK_SIZE,
        scaleMode: 'nearest',
        autoGenerateMipmaps: false,
      });
      const sprite = new Sprite(new Texture({ source }));
      sprite.x = chunk.cx * CHUNK_SIZE;
      sprite.y = chunk.cy * CHUNK_SIZE;
      sprite.roundPixels = true;
      this.container.addChild(sprite);
      this.views.push({ chunk, pixels, source, sprite });
    }
  }

  /**
   * Max chunks recoloured/uploaded per frame. Huge reactions spread their
   * uploads over a few frames instead of causing one long frame. Visible
   * chunks go first.
   */
  maxUploadsPerFrame = 48;

  /** Recolour dirty rows and schedule partial uploads. */
  update(): void {
    const t0 = performance.now();
    let dirty = this.world.takeDirty();
    if (dirty.length > this.maxUploadsPerFrame) {
      const vis = (c: Chunk) => (this.views[c.cy * this.world.chunksX + c.cx].sprite.visible ? 0 : 1);
      dirty.sort((a, b) => vis(a) - vis(b));
      this.world.requeueDirty(dirty.slice(this.maxUploadsPerFrame));
      dirty = dirty.slice(0, this.maxUploadsPerFrame);
    }
    let texels = 0;
    for (const chunk of dirty) {
      const view = this.views[chunk.cy * this.world.chunksX + chunk.cx];
      const y0 = Math.max(0, chunk.dirtyY0);
      const y1 = Math.min(CHUNK_SIZE - 1, chunk.dirtyY1);
      if (y1 >= y0) {
        this.paintRows(view, y0, y1);
        const start = y0 * CHUNK_SIZE;
        const end = (y1 + 1) * CHUNK_SIZE;
        view.source.update(start, end);
        texels += end - start;
      }
      this.world.clearDirty(chunk);
    }
    this.stats.uploads = dirty.length;
    this.stats.texels = texels;
    this.stats.ms = performance.now() - t0;
  }

  /** Hide chunks outside the visible world-space rectangle. */
  cull(x0: number, y0: number, x1: number, y1: number): void {
    let n = 0;
    for (const v of this.views) {
      const sx = v.sprite.x;
      const sy = v.sprite.y;
      const vis = sx + CHUNK_SIZE >= x0 && sx <= x1 && sy + CHUNK_SIZE >= y0 && sy <= y1;
      v.sprite.visible = vis;
      if (vis) n++;
    }
    this.stats.visible = n;
  }

  private paintRows(view: ChunkView, y0: number, y1: number): void {
    const { chunk, pixels } = view;
    const world = this.world;
    const seed = world.seed;
    const gx0 = chunk.cx * CHUNK_SIZE;
    const gy0 = chunk.cy * CHUNK_SIZE;
    const h = world.height;
    for (let ly = y0; ly <= y1; ly++) {
      const gy = gy0 + ly;
      const depthShade = 1 - (gy / h) * 0.35;
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const i = (ly << 6) | lx;
        const p = i * 4;
        const m = chunk.mat[i] as Mat;
        if (m === Mat.Air) {
          pixels[p + 3] = 0;
          continue;
        }
        const def = MATERIALS[m];
        const gx = gx0 + lx;
        // Stable per-cell variation, 2×2 blocky for a pixel-art feel.
        const v = 1 + (hash01(gx, gy, seed) - 0.5) * def.variation + (hash01(gx >> 1, gy >> 1, seed ^ 0xa1) - 0.5) * def.variation;
        let k = v * (def.emissive ? 1 : depthShade);
        // Exposed top edge highlight, exposed side edges slightly lighter.
        if (world.getMat(gx, gy - 1) === Mat.Air) k *= 1.35;
        else if (world.getMat(gx - 1, gy) === Mat.Air || world.getMat(gx + 1, gy) === Mat.Air) k *= 1.12;
        else if (world.getMat(gx, gy + 1) === Mat.Air) k *= 0.8;
        // Damage darkening with a crack pattern.
        const hp = chunk.hp[i];
        if (hp < def.durability) {
          const f = hp / def.durability;
          const crack = hash01(gx, gy, seed ^ 0xc7) > f ? 0.55 : 0.85;
          k *= 0.5 + 0.5 * f * crack + 0.15;
        }
        pixels[p] = Math.min(255, BASE_R[m] * k);
        pixels[p + 1] = Math.min(255, BASE_G[m] * k);
        pixels[p + 2] = Math.min(255, BASE_B[m] * k);
        pixels[p + 3] = 255;
      }
    }
  }

  destroy(): void {
    for (const v of this.views) {
      v.sprite.texture.destroy(true);
    }
    this.container.destroy({ children: true });
  }
}
