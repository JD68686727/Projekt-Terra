import { BufferImageSource, Container, Sprite, Texture } from 'pixi.js';
import { CHUNK_SIZE, Chunk, World } from '../world/World';
import { MATERIALS, Mat } from '../world/materials';
import { hash01 } from '../world/rng';
import { Neighbourhood, cellColor, shade } from './materialArt';
import { surfaceAt } from '../world/generator';

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
  /** Original surface height per column (moss placement). */
  private readonly surface: Int32Array;

  constructor(world: World) {
    this.world = world;
    this.surface = new Int32Array(world.width);
    for (let x = 0; x < world.width; x++) this.surface[x] = surfaceAt(x, world.height, world.seed);
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

  /** Max visible chunks recoloured/uploaded per frame. */
  maxUploadsPerFrame = 48;
  /** CPU time budget for recolouring per frame (ms). */
  timeBudgetMs = 6;
  /** Off-screen chunks pre-painted per frame (lazy background work). */
  maxOffscreenPerFrame = 3;

  /**
   * Recolour dirty rows and schedule partial uploads. Visible chunks go first
   * (bounded per frame); off-screen chunks are painted a few per frame so a
   * fresh world never causes one long frame.
   */
  update(): void {
    const t0 = performance.now();
    const all = this.world.takeDirty();
    const dirty: Chunk[] = [];
    const later: Chunk[] = [];
    let offscreen = 0;
    for (const c of all) {
      const visible = this.views[c.cy * this.world.chunksX + c.cx].sprite.visible;
      if (visible && dirty.length < this.maxUploadsPerFrame) dirty.push(c);
      else if (!visible && offscreen < this.maxOffscreenPerFrame) {
        dirty.push(c);
        offscreen++;
      } else later.push(c);
    }
    if (later.length) this.world.requeueDirty(later);
    let texels = 0;
    let n = 0;
    for (const chunk of dirty) {
      // Time budget: never spend more than ~6 ms per frame painting; the rest waits.
      if (n > 0 && performance.now() - t0 > this.timeBudgetMs) {
        this.world.requeueDirty(dirty.slice(n));
        break;
      }
      n++;
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
    this.stats.uploads = n;
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
    const nb: Neighbourhood = { up: false, down: false, left: false, right: false, nearAir: false, surfaceDepth: 0 };
    for (let ly = y0; ly <= y1; ly++) {
      const gy = gy0 + ly;
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
        nb.up = world.getMat(gx, gy - 1) === Mat.Air;
        nb.down = world.getMat(gx, gy + 1) === Mat.Air;
        nb.left = world.getMat(gx - 1, gy) === Mat.Air;
        nb.right = world.getMat(gx + 1, gy) === Mat.Air;
        nb.nearAir =
          nb.up || nb.down || nb.left || nb.right ||
          world.getMat(gx, gy - 2) === Mat.Air || world.getMat(gx, gy + 2) === Mat.Air ||
          world.getMat(gx - 2, gy) === Mat.Air || world.getMat(gx + 2, gy) === Mat.Air;
        nb.surfaceDepth = gy - this.surface[gx];
        let rgb = cellColor(m, gx, gy, seed, nb, def.emissive);
        // Damage: darken with a stable crack pattern as hit points drop.
        const hp = chunk.hp[i];
        if (hp < def.durability) {
          const f = hp / def.durability;
          rgb = shade(rgb, hash01(gx, gy, seed ^ 0xc7) > f ? 0.45 : 0.55 + 0.45 * f);
        }
        pixels[p] = (rgb >> 16) & 0xff;
        pixels[p + 1] = (rgb >> 8) & 0xff;
        pixels[p + 2] = rgb & 0xff;
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
