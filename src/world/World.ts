import { MATERIALS, Mat } from './materials';

export const CHUNK_SHIFT = 6;
export const CHUNK_SIZE = 1 << CHUNK_SHIFT; // 64
const CHUNK_MASK = CHUNK_SIZE - 1;
const CHUNK_CELLS = CHUNK_SIZE * CHUNK_SIZE;

export interface Chunk {
  readonly cx: number;
  readonly cy: number;
  /** Material id per cell. */
  readonly mat: Uint8Array;
  /** Remaining hit points per cell. */
  readonly hp: Uint16Array;
  /** Needs a texture re-upload. */
  dirty: boolean;
  /** Differs from the seed-generated state (for saving). */
  modified: boolean;
  /** Dirty local row range [dirtyY0, dirtyY1] (inclusive) for partial uploads. */
  dirtyY0: number;
  dirtyY1: number;
}

export interface DestroyedCell {
  x: number;
  y: number;
  mat: Mat;
}

export type DestroyListener = (x: number, y: number, mat: Mat) => void;

/**
 * Chunked cell world. Width/height must be multiples of CHUNK_SIZE.
 * No per-cell objects; all state lives in typed arrays.
 */
export class World {
  readonly width: number;
  readonly height: number;
  readonly chunksX: number;
  readonly chunksY: number;
  readonly chunks: Chunk[];
  readonly seed: number;
  private readonly dirtyList: Chunk[] = [];
  onDestroy: DestroyListener | null = null;
  /** Optional damage divisor for Core Material cells (resonance shields). */
  coreShield: ((x: number, y: number) => number) | null = null;
  /** Called for every damage application on a solid cell (before hp check). */
  onHit: DestroyListener | null = null;

  constructor(width: number, height: number, seed: number) {
    if (width % CHUNK_SIZE || height % CHUNK_SIZE) {
      throw new Error(`World size must be a multiple of ${CHUNK_SIZE}`);
    }
    this.width = width;
    this.height = height;
    this.seed = seed >>> 0;
    this.chunksX = width >> CHUNK_SHIFT;
    this.chunksY = height >> CHUNK_SHIFT;
    this.chunks = [];
    for (let cy = 0; cy < this.chunksY; cy++) {
      for (let cx = 0; cx < this.chunksX; cx++) {
        this.chunks.push({
          cx,
          cy,
          mat: new Uint8Array(CHUNK_CELLS),
          hp: new Uint16Array(CHUNK_CELLS),
          dirty: false,
          modified: false,
          dirtyY0: CHUNK_SIZE,
          dirtyY1: -1,
        });
      }
    }
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  chunkAt(x: number, y: number): Chunk {
    return this.chunks[(y >> CHUNK_SHIFT) * this.chunksX + (x >> CHUNK_SHIFT)];
  }

  getMat(x: number, y: number): Mat {
    if (!this.inBounds(x, y)) return Mat.Air;
    return this.chunkAt(x, y).mat[((y & CHUNK_MASK) << CHUNK_SHIFT) | (x & CHUNK_MASK)] as Mat;
  }

  getHp(x: number, y: number): number {
    if (!this.inBounds(x, y)) return 0;
    return this.chunkAt(x, y).hp[((y & CHUNK_MASK) << CHUNK_SHIFT) | (x & CHUNK_MASK)];
  }

  /** Sets a cell to a material with full durability. Used by generation. */
  setMat(x: number, y: number, m: Mat, markModified = true): void {
    if (!this.inBounds(x, y)) return;
    const c = this.chunkAt(x, y);
    const i = ((y & CHUNK_MASK) << CHUNK_SHIFT) | (x & CHUNK_MASK);
    c.mat[i] = m;
    c.hp[i] = MATERIALS[m].durability;
    this.markDirty(c, y & CHUNK_MASK);
    if (markModified) c.modified = true;
  }

  /**
   * Applies integer damage. Returns the destroyed material, or Air if the
   * cell survived / was empty.
   */
  damage(x: number, y: number, amount: number): Mat {
    if (amount <= 0 || !this.inBounds(x, y)) return Mat.Air;
    const c = this.chunkAt(x, y);
    const i = ((y & CHUNK_MASK) << CHUNK_SHIFT) | (x & CHUNK_MASK);
    const m = c.mat[i] as Mat;
    if (m === Mat.Air) return Mat.Air;
    this.onHit?.(x, y, m);
    if (m === Mat.CoreMaterial && this.coreShield) amount = Math.max(1, Math.floor(amount / this.coreShield(x, y)));
    const hp = c.hp[i];
    c.modified = true;
    this.markDirty(c, y & CHUNK_MASK);
    if (amount >= hp) {
      c.mat[i] = Mat.Air;
      c.hp[i] = 0;
      // Neighbours may gain exposed edges (possibly in adjacent chunks).
      this.touch(x, y - 1);
      this.touch(x, y + 1);
      this.touch(x - 1, y);
      this.touch(x + 1, y);
      this.onDestroy?.(x, y, m);
      return m;
    }
    c.hp[i] = hp - amount;
    return Mat.Air;
  }

  private touch(x: number, y: number): void {
    if (this.inBounds(x, y)) this.markDirty(this.chunkAt(x, y), y & CHUNK_MASK);
  }

  private markDirty(c: Chunk, row: number): void {
    if (row < c.dirtyY0) c.dirtyY0 = row;
    if (row > c.dirtyY1) c.dirtyY1 = row;
    if (!c.dirty) {
      c.dirty = true;
      this.dirtyList.push(c);
    }
  }

  /**
   * Returns the chunks modified since the last call. Consumers must call
   * clearDirty(chunk) after processing to reset the row range.
   */
  takeDirty(): Chunk[] {
    return this.dirtyList.splice(0);
  }

  /** Puts still-dirty chunks back for a later frame (upload budget). */
  requeueDirty(chunks: Chunk[]): void {
    for (const c of chunks) if (c.dirty) this.dirtyList.push(c);
  }

  clearDirty(c: Chunk): void {
    c.dirty = false;
    c.dirtyY0 = CHUNK_SIZE;
    c.dirtyY1 = -1;
  }

  /** Marks every chunk dirty (after generation / load). */
  markAllDirty(): void {
    this.dirtyList.length = 0;
    for (const c of this.chunks) {
      c.dirty = true;
      c.dirtyY0 = 0;
      c.dirtyY1 = CHUNK_SIZE - 1;
      this.dirtyList.push(c);
    }
  }

  /**
   * Bulk-loads a row-major material array (from generation) with full
   * durability. Chunks are left unmodified and all marked dirty.
   */
  loadMaterials(src: Uint8Array): void {
    if (src.length !== this.width * this.height) throw new Error('Material array size mismatch');
    const W = this.width;
    for (const c of this.chunks) {
      const gx = c.cx << CHUNK_SHIFT;
      const gy = c.cy << CHUNK_SHIFT;
      for (let ly = 0; ly < CHUNK_SIZE; ly++) {
        const row = (gy + ly) * W + gx;
        const base = ly << CHUNK_SHIFT;
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const m = src[row + lx];
          c.mat[base + lx] = m;
          c.hp[base + lx] = MATERIALS[m].durability;
        }
      }
      c.modified = false;
    }
    this.markAllDirty();
  }

  countSolid(): number {
    let n = 0;
    for (const c of this.chunks) for (let i = 0; i < CHUNK_CELLS; i++) if (c.mat[i] !== 0) n++;
    return n;
  }
}
