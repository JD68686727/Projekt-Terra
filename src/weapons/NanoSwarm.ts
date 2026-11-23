import type { World } from '../world/World';
import { Mat } from '../world/materials';

export interface SwarmStats {
  /** Number of nanos (clamped to 64). */
  count: number;
  /** Damage per second per nano. */
  dps: number;
  /** Max distance from the anchor to a minable cell centre. */
  leash: number;
  /** Nano movement speed in cells/s. */
  speed: number;
}

const CAPACITY = 64;
const MAX_SEARCHES = 8;
const SEARCH_R = 8;
const CUT_RANGE_SQ = 1.2 * 1.2;
const NO_TARGET = -1;
/** Score penalty (in squared cells) for cells with no Air neighbour. */
const BURIED_PENALTY = 25;

/**
 * Swarm of nanos that each pick an exposed solid cell near the anchor and
 * grind it down. Typed arrays only; at most 8 target searches per update.
 */
export class NanoSwarm {
  stats: SwarmStats;
  active = false;
  anchorX = 0;
  anchorY = 0;
  readonly x = new Float32Array(CAPACITY);
  readonly y = new Float32Array(CAPACITY);
  readonly tx = new Int32Array(CAPACITY).fill(NO_TARGET);
  readonly ty = new Int32Array(CAPACITY).fill(NO_TARGET);
  /** 1 while that nano is cutting this update. Capacity 64 (use first `count`). */
  readonly cutting = new Uint8Array(CAPACITY);
  /** Searches performed in the last update (≤ 8). */
  lastSearches = 0;
  private readonly carry = new Float32Array(CAPACITY);
  private cursor = 0;

  constructor(stats: SwarmStats) {
    this.stats = stats;
  }

  private get count(): number {
    return Math.max(0, Math.min(CAPACITY, Math.floor(this.stats.count)));
  }

  deploy(x: number, y: number): void {
    this.anchorX = x;
    this.anchorY = y;
    this.active = true;
    this.cursor = 0;
    for (let i = 0; i < CAPACITY; i++) {
      const a = i * 2.399963229728653; // golden angle
      const r = 0.5 + 0.35 * Math.sqrt(i);
      this.x[i] = x + Math.cos(a) * r;
      this.y[i] = y + Math.sin(a) * r;
      this.tx[i] = NO_TARGET;
      this.ty[i] = NO_TARGET;
      this.carry[i] = 0;
    }
    this.cutting.fill(0);
  }

  recall(): void {
    this.active = false;
    this.cutting.fill(0);
  }

  update(world: World, dt: number): void {
    this.lastSearches = 0;
    this.cutting.fill(0);
    if (!this.active) return;
    const n = this.count;
    if (n === 0) return;
    const { dps, speed } = this.stats;
    // Round-robin: nanos needing a target are served in cursor order.
    let lastSearched = -1;
    for (let k = 0; k < n; k++) {
      const i = (this.cursor + k) % n;
      if (this.needsTarget(world, i) && this.lastSearches < MAX_SEARCHES) {
        this.lastSearches++;
        this.search(world, i);
        lastSearched = k;
      }
    }
    if (lastSearched >= 0) this.cursor = (this.cursor + lastSearched + 1) % n;

    for (let i = 0; i < n; i++) {
      const tx = this.tx[i];
      if (tx === NO_TARGET || world.getMat(tx, this.ty[i]) === Mat.Air) continue;
      const px = tx + 0.5;
      const py = this.ty[i] + 0.5;
      const dx = px - this.x[i];
      const dy = py - this.y[i];
      const d2 = dx * dx + dy * dy;
      if (d2 > CUT_RANGE_SQ) {
        const d = Math.sqrt(d2);
        const mv = Math.min(d, speed * dt);
        this.x[i] += (dx / d) * mv;
        this.y[i] += (dy / d) * mv;
      } else {
        this.cutting[i] = 1;
        this.carry[i] += dps * dt;
        const dmg = Math.floor(this.carry[i]);
        if (dmg > 0) {
          this.carry[i] -= dmg;
          world.damage(tx, this.ty[i], dmg);
        }
      }
    }
  }

  private needsTarget(world: World, i: number): boolean {
    const tx = this.tx[i];
    return tx === NO_TARGET || world.getMat(tx, this.ty[i]) === Mat.Air;
  }

  private search(world: World, i: number): void {
    const cx = Math.floor(this.x[i]);
    const cy = Math.floor(this.y[i]);
    const nx = this.x[i];
    const ny = this.y[i];
    const leashSq = this.stats.leash * this.stats.leash;
    let best = Infinity;
    let bx = NO_TARGET;
    let by = NO_TARGET;
    for (let y = cy - SEARCH_R; y <= cy + SEARCH_R; y++) {
      const ay = y + 0.5 - this.anchorY;
      for (let x = cx - SEARCH_R; x <= cx + SEARCH_R; x++) {
        const ax = x + 0.5 - this.anchorX;
        if (ax * ax + ay * ay > leashSq) continue;
        if (world.getMat(x, y) === Mat.Air) continue;
        const dx = x + 0.5 - nx;
        const dy = y + 0.5 - ny;
        let score = dx * dx + dy * dy;
        if (score >= best) continue;
        const exposed =
          world.getMat(x - 1, y) === Mat.Air || world.getMat(x + 1, y) === Mat.Air ||
          world.getMat(x, y - 1) === Mat.Air || world.getMat(x, y + 1) === Mat.Air;
        if (!exposed) score += BURIED_PENALTY;
        if (score < best) {
          best = score;
          bx = x;
          by = y;
        }
      }
    }
    this.tx[i] = bx;
    this.ty[i] = by;
  }
}
