import { World } from './World';
import { Mat, isResonant } from './materials';

export interface ReactionStats {
  /** Max BFS depth a resonance chain travels from its trigger cell. */
  resonanceDepth: number;
  /** Chance (0..1) that destroyed unstable ore detonates. */
  oreChance: number;
  /** Radius of an ore detonation in cells. */
  oreRadius: number;
  /** Damage of an ore detonation at its centre. */
  oreDamage: number;
}

export interface ReactionEvents {
  /** A crystal cell was consumed by resonance (for RF + visuals). */
  onResonance?: (x: number, y: number, depth: number) => void;
  /** An ore cell detonated. */
  onBlast?: (x: number, y: number, radius: number) => void;
}

// Hard caps keep every tick bounded regardless of world content.
const RES_BUDGET = 400; // crystal cells per tick
const RES_QUEUE_CAP = 32768;
const BLAST_BUDGET = 24; // detonations per tick
const BLAST_QUEUE_CAP = 512;

/**
 * Bounded chain-reaction processor.
 *
 * Resonance: touching a Resonance Crystal charges it; charge spreads
 * breadth-first through 4-connected crystal cells, one BFS layer per tick
 * (visible wave), consuming each cell. Depth and per-tick work are capped.
 *
 * Unstable ore: when destroyed, may detonate (queued, never recursive);
 * blasts can destroy further ore, which re-queues — bounded by caps.
 */
export class Reactions {
  stats: ReactionStats;
  events: ReactionEvents = {};
  /** Cells consumed by resonance since construction. */
  resonated = 0;
  blasts = 0;

  private readonly world: World;
  /** 1 = already charged/queued (prevents duplicates and infinite loops). */
  private readonly charged: Uint8Array;
  // Ring-buffer queue: packed cell index + depth.
  private readonly qCell = new Int32Array(RES_QUEUE_CAP);
  private readonly qDepth = new Uint16Array(RES_QUEUE_CAP);
  private qHead = 0;
  private qLen = 0;
  private readonly bx = new Float32Array(BLAST_QUEUE_CAP);
  private readonly by = new Float32Array(BLAST_QUEUE_CAP);
  /** 0 = ore blast, 1 = frost shatter (wider, weaker). */
  private readonly bk = new Uint8Array(BLAST_QUEUE_CAP);
  private bHead = 0;
  private bLen = 0;
  private seq = 0;
  /** Deterministic chance source (no Math.random in simulation). */
  private rngState = 0x9e3779b9;

  constructor(world: World, stats: ReactionStats) {
    this.world = world;
    this.stats = stats;
    this.charged = new Uint8Array(world.width * world.height);
  }

  get pending(): number {
    return this.qLen + this.bLen;
  }

  /** Called for every damaged (non-air) cell. */
  onHit(x: number, y: number, m: Mat): void {
    if (isResonant(m)) this.charge(x, y, 0);
  }

  /** Called for every destroyed cell. */
  onDestroyed(x: number, y: number, m: Mat): void {
    if (m === Mat.UnstableOre && this.chance() < this.stats.oreChance) this.queueBlast(x + 0.5, y + 0.5);
    // Glutstein sparks more reliably than Unstable Ore (Rote Wüste: Zündschnur).
    // Frost Crystal shatters in a wide but weaker blast (Eiswelt).
    else if (m === Mat.FrostCrystal && this.chance() < Math.min(1, this.stats.oreChance * 0.9)) this.queueBlast(x + 0.5, y + 0.5, 1);
    else if (m === Mat.Glutstein && this.chance() < Math.min(1, this.stats.oreChance * 1.2)) this.queueBlast(x + 0.5, y + 0.5);
  }

  private charge(x: number, y: number, depth: number): void {
    const i = y * this.world.width + x;
    if (this.charged[i]) return;
    if (this.qLen >= RES_QUEUE_CAP) return; // drop: bounded memory
    this.charged[i] = 1;
    const slot = (this.qHead + this.qLen) % RES_QUEUE_CAP;
    this.qCell[slot] = i;
    this.qDepth[slot] = depth;
    this.qLen++;
  }

  private queueBlast(x: number, y: number, kind = 0): void {
    if (this.bLen >= BLAST_QUEUE_CAP) return;
    const slot = (this.bHead + this.bLen) % BLAST_QUEUE_CAP;
    this.bx[slot] = x;
    this.by[slot] = y;
    this.bk[slot] = kind;
    this.bLen++;
  }

  update(): void {
    this.processResonance();
    this.processBlasts();
  }

  private processResonance(): void {
    const w = this.world;
    const W = w.width;
    // One BFS layer per tick: only entries present at tick start, within budget.
    const n = Math.min(this.qLen, RES_BUDGET);
    for (let k = 0; k < n; k++) {
      const i = this.qCell[this.qHead];
      const d = this.qDepth[this.qHead];
      this.qHead = (this.qHead + 1) % RES_QUEUE_CAP;
      this.qLen--;
      const x = i % W;
      const y = (i - x) / W;
      // The trigger cell may already have been destroyed by the weapon that
      // charged it; the charge still propagates to its neighbours.
      if (isResonant(w.getMat(x, y))) {
        w.damage(x, y, 0xffff);
        this.resonated++;
        this.events.onResonance?.(x, y, d);
      }
      if (d >= this.stats.resonanceDepth) continue;
      // Rotate neighbour order for less grid-aligned spread.
      const r = (this.seq++ & 3);
      for (let j = 0; j < 4; j++) {
        const dir = (j + r) & 3;
        const nx = x + (dir === 0 ? 1 : dir === 1 ? -1 : 0);
        const ny = y + (dir === 2 ? 1 : dir === 3 ? -1 : 0);
        if (isResonant(w.getMat(nx, ny))) this.charge(nx, ny, d + 1);
      }
    }
  }

  private processBlasts(): void {
    const n = Math.min(this.bLen, BLAST_BUDGET);
    const { oreRadius: R0, oreDamage: D0 } = this.stats;
    for (let k = 0; k < n; k++) {
      const cx = this.bx[this.bHead];
      const cy = this.by[this.bHead];
      const frost = this.bk[this.bHead] === 1;
      const R = frost ? R0 * 1.5 : R0;
      const D = frost ? D0 * 0.55 : D0;
      const r2 = R * R;
      this.bHead = (this.bHead + 1) % BLAST_QUEUE_CAP;
      this.bLen--;
      this.blasts++;
      this.events.onBlast?.(cx, cy, R);
      const x0 = Math.floor(cx - R);
      const x1 = Math.ceil(cx + R);
      const y0 = Math.floor(cy - R);
      const y1 = Math.ceil(cy + R);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x + 0.5 - cx;
          const dy = y + 0.5 - cy;
          const d2 = dx * dx + dy * dy;
          if (d2 > r2) continue;
          // Destroyed ore inside re-queues via onDestroyed (bounded by caps).
          this.world.damage(x, y, Math.round(D * (1 - 0.5 * Math.sqrt(d2) / R)));
        }
      }
    }
  }

  private chance(): number {
    let t = (this.rngState = (this.rngState + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}
