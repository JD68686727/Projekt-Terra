import { World } from '../world/World';
import { Mat } from '../world/materials';
import { traverseGrid } from '../world/raycast';
import { hash01 } from '../world/rng';

export interface FractureStats {
  /** Max cells a single fracture may affect. */
  maxCells: number;
  /** Damage at full energy. */
  damage: number;
  /** Energy lost per step through rock (crystal costs much less). */
  decay: number;
  /** Fuse time in seconds. */
  fuse: number;
  cooldown: number;
  range: number;
}

export interface Charge {
  x: number;
  y: number;
  fuseLeft: number;
}

export interface FractureFront {
  x: number;
  y: number;
  energy: number;
}

const BUDGET = 350; // cells per tick
const NX = [1, -1, 0, 0, 1, 1, -1, -1];
const NY = [0, 0, 1, -1, 1, -1, 1, -1];
const QUEUE_CAP = 16384;
const MAX_CHARGES = 4;

/**
 * Placed charge; on detonation a fracture front spreads breadth-first
 * through solid cells. Energy decays per step (slowly through Resonance
 * Crystal, which acts as a conductor), the front branches into every solid
 * neighbour, and the total number of affected cells is capped. Work per tick
 * is bounded by BUDGET; no recursion.
 */
export class FractureCharge {
  stats: FractureStats;
  cooldownLeft = 0;
  readonly charges: Charge[] = [];
  /** Cells processed since construction (for tests / stats). */
  processed = 0;
  onDetonate: ((x: number, y: number) => void) | null = null;
  /** Called for each cell the front reaches (FX). */
  onFront: ((x: number, y: number, energy: number) => void) | null = null;

  private readonly qx = new Int32Array(QUEUE_CAP);
  private readonly qy = new Int32Array(QUEUE_CAP);
  private readonly qe = new Float32Array(QUEUE_CAP);
  private qHead = 0;
  private qLen = 0;
  /** Visited set per detonation, keyed by packed cell index. */
  private readonly visited = new Set<number>();
  private remainingCells = 0;
  private readonly world: World;

  constructor(world: World, stats: FractureStats) {
    this.world = world;
    this.stats = stats;
  }

  get ready(): boolean {
    return this.cooldownLeft <= 0 && this.charges.length < MAX_CHARGES;
  }

  get active(): boolean {
    return this.qLen > 0 || this.charges.length > 0;
  }

  /** Places a charge on the first solid cell toward the target. */
  place(ox: number, oy: number, tx: number, ty: number): Charge | null {
    if (!this.ready) return null;
    const dx = tx - ox;
    const dy = ty - oy;
    const len = Math.hypot(dx, dy);
    if (len === 0) return null;
    let hit: Charge | null = null;
    traverseGrid(ox, oy, dx, dy, Math.min(len, this.stats.range), (cx, cy) => {
      if (this.world.getMat(cx, cy) === Mat.Air) return true;
      hit = { x: cx, y: cy, fuseLeft: this.stats.fuse };
      return false;
    });
    if (!hit) return null;
    this.charges.push(hit);
    this.cooldownLeft = this.stats.cooldown;
    return hit;
  }

  update(dt: number): void {
    this.cooldownLeft = Math.max(0, this.cooldownLeft - dt);
    for (let i = this.charges.length - 1; i >= 0; i--) {
      const c = this.charges[i];
      c.fuseLeft -= dt;
      if (c.fuseLeft <= 0) {
        this.charges.splice(i, 1);
        this.detonate(c.x, c.y);
      }
    }
    this.propagate();
  }

  private detonate(x: number, y: number): void {
    // A new detonation starts a fresh budget; an unfinished front keeps going.
    if (this.qLen === 0) this.visited.clear();
    this.remainingCells += this.stats.maxCells;
    this.onDetonate?.(x + 0.5, y + 0.5);
    this.enqueue(x, y, 1);
  }

  private enqueue(x: number, y: number, e: number): void {
    const key = y * this.world.width + x;
    if (this.visited.has(key) || this.qLen >= QUEUE_CAP) return;
    this.visited.add(key);
    const s = (this.qHead + this.qLen) % QUEUE_CAP;
    this.qx[s] = x;
    this.qy[s] = y;
    this.qe[s] = e;
    this.qLen++;
  }

  private propagate(): void {
    const w = this.world;
    const n = Math.min(this.qLen, BUDGET);
    for (let k = 0; k < n; k++) {
      const x = this.qx[this.qHead];
      const y = this.qy[this.qHead];
      const e = this.qe[this.qHead];
      this.qHead = (this.qHead + 1) % QUEUE_CAP;
      this.qLen--;
      if (this.remainingCells <= 0) continue;
      const m = w.getMat(x, y);
      if (m === Mat.Air) continue;
      this.remainingCells--;
      this.processed++;
      this.onFront?.(x, y, e);
      w.damage(x, y, Math.round(this.stats.damage * e));
      // Deterministic per-cell jitter makes cracks irregular instead of a diamond.
      const jitter = 0.35 + 1.3 * hash01(x, y, w.seed ^ 0xf4ac);
      const cost = (m === Mat.ResonanceCrystal ? this.stats.decay * 0.15 : this.stats.decay) * jitter;
      const ne = e - cost;
      if (ne <= 0.05) continue;
      // 8-connected spread (diagonals cost √2) gives round fronts; a few
      // deterministic dead branches make it look like cracking rock.
      for (let k = 0; k < 8; k++) {
        const ox = NX[k];
        const oy = NY[k];
        const tx = x + ox;
        const ty = y + oy;
        const tm = w.getMat(tx, ty);
        if (tm === Mat.Air) continue;
        // Crystal always conducts; only rock branches may die off.
        if (tm !== Mat.ResonanceCrystal && hash01(tx, ty, w.seed ^ 0xb7a) < 0.18) continue;
        this.enqueue(tx, ty, k < 4 ? ne : e - cost * 1.414);
      }
    }
    if (this.qLen === 0) this.remainingCells = 0;
  }
}
