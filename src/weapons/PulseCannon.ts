import { World } from '../world/World';
import { Mat } from '../world/materials';
import { traverseGrid } from '../world/raycast';

export interface PulseStats {
  /** Damage at the centre; falls off toward the edge. */
  damage: number;
  /** Final shockwave radius in cells. */
  radius: number;
  /** Seconds between shots. */
  cooldown: number;
  /** Max distance from the rig to the detonation point. */
  range: number;
}

export interface Shockwave {
  x: number;
  y: number;
  r: number;
  maxR: number;
  damage: number;
  /** Seconds since spawn, for visuals. */
  age: number;
}

const EXPANSION_SPEED = 45; // cells/s
const MAX_WAVES = 12;

/**
 * Radial shockwaves. Each wave expands over several ticks and damages only
 * the annulus it crossed this tick, so per-tick work is bounded by the
 * ring area (≤ π·R² over the wave's lifetime), not by world size.
 */
export class PulseCannon {
  stats: PulseStats;
  cooldownLeft = 0;
  readonly waves: Shockwave[] = [];

  constructor(stats: PulseStats) {
    this.stats = stats;
  }

  get ready(): boolean {
    return this.cooldownLeft <= 0;
  }

  /**
   * Detonates at the first solid cell between the rig and the target (or the
   * target itself, clamped to range). Returns the wave or null on cooldown.
   */
  fire(world: World, ox: number, oy: number, tx: number, ty: number): Shockwave | null {
    if (!this.ready || this.waves.length >= MAX_WAVES) return null;
    const dx = tx - ox;
    const dy = ty - oy;
    const len = Math.hypot(dx, dy);
    const range = Math.min(this.stats.range, len);
    let hx = ox + (len ? (dx / len) * range : 0);
    let hy = oy + (len ? (dy / len) * range : 0);
    if (len > 0) {
      traverseGrid(ox, oy, dx, dy, range, (cx, cy, d) => {
        if (world.getMat(cx, cy) === Mat.Air) return true;
        hx = ox + (dx / len) * d;
        hy = oy + (dy / len) * d;
        return false;
      });
    }
    const wave: Shockwave = { x: hx, y: hy, r: 0, maxR: this.stats.radius, damage: this.stats.damage, age: 0 };
    this.waves.push(wave);
    this.cooldownLeft = this.stats.cooldown;
    return wave;
  }

  update(world: World, dt: number): void {
    this.cooldownLeft = Math.max(0, this.cooldownLeft - dt);
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.age += dt;
      if (w.r >= w.maxR) {
        // Keep briefly for the fade-out visual, then remove.
        if (w.age > w.maxR / EXPANSION_SPEED + 0.25) this.waves.splice(i, 1);
        continue;
      }
      const r0 = w.r;
      const r1 = Math.min(w.maxR, r0 + EXPANSION_SPEED * dt);
      w.r = r1;
      this.damageRing(world, w, r0, r1);
    }
  }

  private damageRing(world: World, w: Shockwave, r0: number, r1: number): void {
    const r0sq = r0 * r0;
    const r1sq = r1 * r1;
    const x0 = Math.floor(w.x - r1);
    const x1 = Math.ceil(w.x + r1);
    const y0 = Math.floor(w.y - r1);
    const y1 = Math.ceil(w.y + r1);
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - w.y;
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - w.x;
        const d2 = dx * dx + dy * dy;
        // First tick includes the centre (r0 = 0 → d2 >= 0).
        if (d2 > r1sq || (r0 > 0 && d2 <= r0sq)) continue;
        const falloff = 1 - 0.6 * (Math.sqrt(d2) / w.maxR);
        world.damage(x, y, Math.round(w.damage * falloff));
      }
    }
  }
}
