/**
 * Fog of war: which parts of the world the player has seen. Stored at a
 * coarse resolution (one fog texel per FOG_CELL×FOG_CELL cells) so it stays
 * tiny (1024×2048 world → 256×512 = 128 KiB) and cheap to persist.
 */
export const FOG_CELL = 4;

export class FogMap {
  readonly fw: number;
  readonly fh: number;
  /** 1 = revealed. */
  readonly data: Uint8Array;
  /** Dirty texel-row range since the last takeDirtyRows(). */
  private d0: number;
  private d1 = -1;

  constructor(worldWidth: number, worldHeight: number) {
    this.fw = Math.ceil(worldWidth / FOG_CELL);
    this.fh = Math.ceil(worldHeight / FOG_CELL);
    this.data = new Uint8Array(this.fw * this.fh);
    this.d0 = this.fh;
  }

  isRevealed(cellX: number, cellY: number): boolean {
    const x = Math.floor(cellX / FOG_CELL);
    const y = Math.floor(cellY / FOG_CELL);
    if (x < 0 || y < 0 || x >= this.fw || y >= this.fh) return true;
    return this.data[y * this.fw + x] === 1;
  }

  /** Reveals a disc around a world position (cells). Returns number of newly revealed texels. */
  reveal(cellX: number, cellY: number, radiusCells: number): number {
    const cx = cellX / FOG_CELL;
    const cy = cellY / FOG_CELL;
    const r = radiusCells / FOG_CELL;
    const r2 = r * r;
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(this.fw - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(this.fh - 1, Math.ceil(cy + r));
    let n = 0;
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - cy;
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        if (dx * dx + dy * dy > r2) continue;
        const i = y * this.fw + x;
        if (this.data[i] === 0) {
          this.data[i] = 1;
          n++;
          if (y < this.d0) this.d0 = y;
          if (y > this.d1) this.d1 = y;
        }
      }
    }
    return n;
  }

  /** Reveals every texel whose top lies above `surfaceCell(x) + margin` (open sky). */
  revealSky(surfaceCell: (x: number) => number, margin: number): void {
    for (let x = 0; x < this.fw; x++) {
      const limit = surfaceCell(Math.min(x * FOG_CELL + FOG_CELL / 2, this.fw * FOG_CELL - 1)) + margin;
      for (let y = 0; y < this.fh && y * FOG_CELL < limit; y++) this.data[y * this.fw + x] = 1;
    }
    this.d0 = 0;
    this.d1 = this.fh - 1;
  }

  takeDirtyRows(): [number, number] | null {
    if (this.d1 < this.d0) return null;
    const r: [number, number] = [this.d0, this.d1];
    this.d0 = this.fh;
    this.d1 = -1;
    return r;
  }

  markAllDirty(): void {
    this.d0 = 0;
    this.d1 = this.fh - 1;
  }

  revealedCount(): number {
    let n = 0;
    for (let i = 0; i < this.data.length; i++) n += this.data[i];
    return n;
  }

  /** RLE: pairs [value, run(1..255)]. */
  encode(): Uint8Array {
    const out: number[] = [];
    let i = 0;
    while (i < this.data.length) {
      const v = this.data[i];
      let run = 1;
      while (i + run < this.data.length && this.data[i + run] === v && run < 255) run++;
      out.push(v, run);
      i += run;
    }
    return Uint8Array.from(out);
  }

  /** Returns false (and leaves the map untouched) if the RLE does not match this size. */
  decode(rle: Uint8Array): boolean {
    if (!fogRleValid(rle, this.fw * this.fh)) return false;
    let o = 0;
    for (let k = 0; k < rle.length; k += 2) {
      this.data.fill(rle[k], o, o + rle[k + 1]);
      o += rle[k + 1];
    }
    this.markAllDirty();
    return true;
  }
}

export function fogRleValid(rle: Uint8Array, total: number): boolean {
  if (rle.length % 2 !== 0) return false;
  let sum = 0;
  for (let k = 0; k < rle.length; k += 2) {
    if (rle[k] > 1 || rle[k + 1] === 0) return false;
    sum += rle[k + 1];
  }
  return sum === total;
}
