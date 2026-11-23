import { BufferImageSource, Container, Sprite, Texture } from 'pixi.js';
import { CHUNK_SIZE, Chunk, World } from '../world/World';
import { MATERIALS, Mat } from '../world/materials';
import { hash01 } from '../world/rng';
import { surfaceAt } from '../world/generator';
import { MOSS, OUTLINE, PALETTES, backColor, bladeColor, boulderSites, boulderStep, fungusPixel, scale, subStep, tuftHeight } from './materialArt';

interface ChunkView {
  chunkIndex: number; // -1 = free
  painted: boolean;
  /** Rows (0..64) already painted during progressive painting. */
  progress: number;
  lastUsed: number;
  pixels: Uint8Array;
  source: BufferImageSource;
  sprite: Sprite;
}

export interface TerrainRenderStats {
  /** Chunks (re)painted this frame (full or partial). */
  uploads: number;
  /** Texels uploaded this frame. */
  texels: number;
  /** CPU ms spent painting this frame. */
  ms: number;
  visible: number;
  /** GPU chunk textures currently allocated. */
  pooled: number;
}

const POOL_MAX = 72;

/**
 * HD terrain renderer.
 *
 * - Each cell is drawn as D×D art pixels (D = detail, 4 on medium/high).
 * - Only chunks near the camera own a texture: views come from a bounded
 *   pool and are recycled (least recently used) as the camera moves, so GPU
 *   memory is independent of world size.
 * - Newly visible chunks are painted fully (closest first, bounded per
 *   frame); dirty rows of mapped chunks are repainted and uploaded partially
 *   (texSubImage2D range). Unmapped dirty chunks are skipped — they are
 *   painted from the current world state when they come into view.
 * - Below the surface, air is painted as the cave back-wall; above it, air
 *   is transparent so the sky shows through.
 */
export class TerrainRenderer {
  readonly container = new Container();
  readonly stats: TerrainRenderStats = { uploads: 0, texels: 0, ms: 0, visible: 0, pooled: 0 };
  readonly detail: number;
  /** Max partially repainted chunks per frame. */
  maxUploadsPerFrame = 48;
  /** Max fully painted (newly visible) chunks per frame after the first frame. */
  maxFullPaintsPerFrame = 3;
  /** Time budget (ms) for full paints per frame; at least one chunk is always painted. */
  fullPaintBudgetMs = 3;

  private readonly world: World;
  private readonly views: ChunkView[] = [];
  private readonly byChunk: (ChunkView | null)[];
  private readonly surface: Int32Array;
  private readonly side: number; // texture side in texels
  private frameNo = 0;
  private cx0 = 0;
  private cy0 = 0;
  private cx1 = -1;
  private cy1 = -1;
  private centreX = 0;
  private centreY = 0;
  private firstPaintDone = false;
  private readonly sites = new Float32Array(18);

  constructor(world: World, detail = 4) {
    this.world = world;
    this.detail = detail;
    this.side = CHUNK_SIZE * detail;
    this.byChunk = new Array(world.chunks.length).fill(null);
    this.surface = new Int32Array(world.width);
    for (let x = 0; x < world.width; x++) this.surface[x] = surfaceAt(x, world.height, world.seed);
    this.container.label = 'terrain';
  }

  /** Sets the visible world rectangle; chunks within it (+1 chunk margin) get mapped. */
  cull(x0: number, y0: number, x1: number, y1: number): void {
    const w = this.world;
    this.cx0 = Math.max(0, Math.floor(x0 / CHUNK_SIZE) - 1);
    this.cy0 = Math.max(0, Math.floor(y0 / CHUNK_SIZE) - 1);
    this.cx1 = Math.min(w.chunksX - 1, Math.floor(x1 / CHUNK_SIZE) + 1);
    this.cy1 = Math.min(w.chunksY - 1, Math.floor(y1 / CHUNK_SIZE) + 1);
    this.centreX = (x0 + x1) / 2;
    this.centreY = (y0 + y1) / 2;
    this.frameNo++;
    let visible = 0;
    for (const v of this.views) {
      if (v.chunkIndex < 0) continue;
      const inRange = this.inRange(w.chunks[v.chunkIndex]);
      v.sprite.visible = inRange && v.painted;
      if (inRange) {
        v.lastUsed = this.frameNo;
        if (v.painted) visible++;
      }
    }
    this.stats.visible = visible;
  }

  private inRange(c: Chunk): boolean {
    return c.cx >= this.cx0 && c.cx <= this.cx1 && c.cy >= this.cy0 && c.cy <= this.cy1;
  }

  update(): void {
    const t0 = performance.now();
    const w = this.world;
    let texels = 0;
    let uploads = 0;

    // 1) Dirty rows of mapped, painted chunks → partial repaint + upload.
    const dirty = w.takeDirty();
    const later: Chunk[] = [];
    for (const c of dirty) {
      const v = this.byChunk[c.cy * w.chunksX + c.cx];
      if (!v || !v.painted) {
        // In-progress chunk: rows already painted above the change must be redone.
        if (v && c.dirtyY0 < v.progress) v.progress = Math.max(0, c.dirtyY0);
        w.clearDirty(c);
        continue;
      }
      if (uploads >= this.maxUploadsPerFrame) {
        later.push(c);
        continue;
      }
      const y0 = Math.max(0, c.dirtyY0);
      const y1 = Math.min(CHUNK_SIZE - 1, c.dirtyY1);
      if (y1 >= y0) {
        this.paintRows(v, c, y0, y1);
        const start = y0 * this.detail * this.side;
        const end = (y1 + 1) * this.detail * this.side;
        v.source.update(start, end);
        texels += end - start;
        uploads++;
      }
      w.clearDirty(c);
    }
    w.requeueDirty(later);

    // 2) Newly visible chunks → map + full paint, closest to the view centre first.
    const need: Chunk[] = [];
    for (let cy = this.cy0; cy <= this.cy1; cy++) {
      for (let cx = this.cx0; cx <= this.cx1; cx++) {
        const idx = cy * w.chunksX + cx;
        const v = this.byChunk[idx];
        if (!v || !v.painted) need.push(w.chunks[idx]);
      }
    }
    if (need.length) {
      const d = (c: Chunk) => (c.cx * CHUNK_SIZE + 32 - this.centreX) ** 2 + (c.cy * CHUNK_SIZE + 32 - this.centreY) ** 2;
      need.sort((a, b) => d(a) - d(b));
      const budget = this.firstPaintDone ? this.maxFullPaintsPerFrame : need.length;
      // Progressive painting: chunks are painted in 8-row slices within a
      // per-frame time budget and shown only once complete (no half chunks).
      const tStart = performance.now();
      const unlimited = !this.firstPaintDone;
      outer: for (let k = 0; k < Math.min(unlimited ? need.length : budget, need.length); k++) {
        const c = need[k];
        const idx = c.cy * w.chunksX + c.cx;
        const v = this.byChunk[idx] ?? this.acquire(idx);
        if (!v) break;
        while (v.progress < CHUNK_SIZE) {
          if (!unlimited && performance.now() - tStart > this.fullPaintBudgetMs) break outer;
          const y1 = Math.min(CHUNK_SIZE - 1, v.progress + 7);
          this.paintRows(v, c, v.progress, y1);
          v.progress = y1 + 1;
        }
        v.source.update();
        v.painted = true;
        v.sprite.visible = true;
        texels += this.side * this.side;
        uploads++;
      }
      this.firstPaintDone = true;
    }

    this.stats.uploads = uploads;
    this.stats.texels = texels;
    this.stats.pooled = this.views.length;
    this.stats.ms = performance.now() - t0;
  }

  /** A view for a chunk: new while the pool has room, else the least recently used out-of-range one. */
  private acquire(chunkIndex: number): ChunkView | null {
    let v: ChunkView | null = null;
    if (this.views.length < POOL_MAX) {
      const pixels = new Uint8Array(this.side * this.side * 4);
      const source = new BufferImageSource({ resource: pixels, width: this.side, height: this.side, scaleMode: 'nearest', autoGenerateMipmaps: false });
      const sprite = new Sprite(new Texture({ source }));
      sprite.scale.set(1 / this.detail);
      sprite.roundPixels = true;
      this.container.addChild(sprite);
      v = { chunkIndex: -1, painted: false, progress: 0, lastUsed: 0, pixels, source, sprite };
      this.views.push(v);
    } else {
      for (const cand of this.views) {
        if (cand.chunkIndex >= 0 && this.inRange(this.world.chunks[cand.chunkIndex])) continue;
        if (!v || cand.lastUsed < v.lastUsed) v = cand;
      }
      if (!v) return null;
      if (v.chunkIndex >= 0) this.byChunk[v.chunkIndex] = null;
    }
    const c = this.world.chunks[chunkIndex];
    v.chunkIndex = chunkIndex;
    v.painted = false;
    v.progress = 0;
    v.lastUsed = this.frameNo;
    v.sprite.x = c.cx * CHUNK_SIZE;
    v.sprite.y = c.cy * CHUNK_SIZE;
    v.sprite.visible = false;
    this.byChunk[chunkIndex] = v;
    return v;
  }

  private paintRows(v: ChunkView, c: Chunk, y0: number, y1: number): void {
    for (let ly = y0; ly <= y1; ly++) for (let lx = 0; lx < CHUNK_SIZE; lx++) this.paintCell(v.pixels, c, lx, ly);
  }

  /** Paints the D×D art pixels of one cell. */
  private paintCell(px: Uint8Array, c: Chunk, lx: number, ly: number): void {
    const D = this.detail;
    const w = this.world;
    const seed = w.seed;
    const gx = c.cx * CHUNK_SIZE + lx;
    const gy = c.cy * CHUNK_SIZE + ly;
    const i = (ly << 6) | lx;
    const m = c.mat[i] as Mat;
    const stride = this.side * 4;
    const base = ly * D * stride + lx * D * 4;
    const surf = this.surface[gx];
    const depth01 = Math.max(0, (gy - surf) / (w.height - surf));

    const put = (si: number, sj: number, rgb: number, a = 255) => {
      const p = base + sj * stride + si * 4;
      px[p] = (rgb >> 16) & 255;
      px[p + 1] = (rgb >> 8) & 255;
      px[p + 2] = rgb & 255;
      px[p + 3] = a;
    };
    // Air art pixel: sky (transparent) near/above the surface, back-wall below.
    const air = (si: number, sj: number) => {
      if (gy < surf + 2) put(si, sj, 0, 0);
      else put(si, sj, backColor(gx * D + si, gy * D + sj, depth01, D, seed));
    };

    const up = w.getMat(gx, gy - 1) === Mat.Air;
    const down = w.getMat(gx, gy + 1) === Mat.Air;
    const left = w.getMat(gx - 1, gy) === Mat.Air;
    const right = w.getMat(gx + 1, gy) === Mat.Air;

    if (m === Mat.Air) {
      const below = w.getMat(gx, gy + 1);
      const above = w.getMat(gx, gy - 1);
      const nearSurface = gy - surf < 6;
      const grass = below !== Mat.Air && nearSurface && below !== Mat.TitaniumMatrix && !MATERIALS[below].emissive;
      const fungus = below !== Mat.Air && !nearSurface && gy > surf + 10 && hash01(gx, gy, seed ^ 0xf6) > 0.93;
      const drips = above !== Mat.Air && gy > surf + 3;
      for (let sj = 0; sj < D; sj++) {
        for (let si = 0; si < D; si++) {
          const sx = gx * D + si;
          const fromFloor = D - 1 - sj;
          if (grass) {
            const h = tuftHeight(gx, gy, si, D, seed);
            if (fromFloor < h) {
              put(si, sj, bladeColor(sx, fromFloor, h));
              continue;
            }
          }
          if (fungus) {
            const f = fungusPixel(si, fromFloor, D);
            if (f >= 0) {
              put(si, sj, f);
              continue;
            }
          }
          if (drips && sj < 2 && hash01(sx, gy, seed ^ 0xd1) > (sj === 0 ? 0.55 : 0.82)) {
            put(si, sj, PALETTES[Mat.Stone][sj === 0 ? 1 : 0]);
            continue;
          }
          air(si, sj);
        }
      }
      return;
    }

    const def = MATERIALS[m];
    const pal = PALETTES[m];
    const emissive = def.emissive;
    const surfaceCell = gy - surf < 4;
    const mossy = !emissive && surfaceCell && m !== Mat.TitaniumMatrix;
    // Organic edges: exposed sides are eroded by 0..D/2 art pixels (per edge, deterministic).
    // Calm edges: no random erosion; only exposed corners are rounded (clean silhouettes).
    const crisp = m === Mat.TitaniumMatrix || m === Mat.CoreMaterial;
    const eT = 0;
    const eB = 0;
    const eL = 0;
    const eR = 0;
    const boulders = m === Mat.Stone || m === Mat.DenseRock;
    if (boulders) boulderSites(gx, gy, D, m === Mat.Stone ? 7 : 11, seed ^ (m === Mat.Stone ? 0xb01 : 0xb02), this.sites);
    // Fake AO: no air within 2 cells → darker interior.
    const deep =
      !up && !down && !left && !right &&
      w.getMat(gx, gy - 2) !== Mat.Air && w.getMat(gx, gy + 2) !== Mat.Air &&
      w.getMat(gx - 2, gy) !== Mat.Air && w.getMat(gx + 2, gy) !== Mat.Air;
    const hp = c.hp[i];
    const dmg = hp < def.durability ? hp / def.durability : 1;

    for (let sj = 0; sj < D; sj++) {
      for (let si = 0; si < D; si++) {
        const dT = up ? sj - eT : 99;
        const dB = down ? D - 1 - sj - eB : 99;
        const dL = left ? si - eL : 99;
        const dR = right ? D - 1 - si - eR : 99;
        // Rounded corners where two exposed edges meet.
        const corner =
          !crisp &&
          ((up && left && si + sj < 2) ||
            (up && right && D - 1 - si + sj < 2) ||
            (down && left && si + D - 1 - sj < 2) ||
            (down && right && 2 * (D - 1) - si - sj < 2));
        if (dT < 0 || dB < 0 || dL < 0 || dR < 0 || corner) {
          air(si, sj);
          continue;
        }
        const sx = gx * D + si;
        const sy = gy * D + sj;
        let rgb: number;
        if (dT === 0 && mossy) {
          rgb = MOSS[hash01(sx, sy, seed ^ 0x3a) > 0.6 ? 4 : 3]; // mossy lip
        } else if (dT === 1 && mossy) {
          rgb = MOSS[hash01(sx, sy, seed ^ 0x3b) > 0.5 ? 2 : 1];
        } else if (dB === 0 || dL === 0 || dR === 0) {
          rgb = emissive ? pal[1] : OUTLINE; // dark outline on shadow sides
        } else {
          let step = boulders ? boulderStep(sx, sy, this.sites, seed) : subStep(m, sx, sy, gx, gy, D, seed);
          if (dT === 0) step = Math.min(4, step + 2); // sunlit rim
          else if (dT === 1) step = Math.min(4, step + 1);
          else if (dB === 1) step = Math.max(0, step - 1);
          else if (deep && !emissive) step = Math.max(0, step - 1);
          rgb = pal[step];
        }
        // Damage: crack pixels spread as hit points fall.
        if (dmg < 1 && hash01(sx, sy, seed ^ 0xc7) > 0.35 + dmg * 0.65) rgb = scale(rgb, 0.4);
        put(si, sj, rgb);
      }
    }
  }

  destroy(): void {
    for (const v of this.views) v.sprite.texture.destroy(true);
    this.container.destroy({ children: true });
  }
}
