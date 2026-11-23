import type { World } from '../world/World';
import { Mat } from '../world/materials';

export interface DrillStats {
  /** Flight speed in cells/s. */
  speed: number;
  /** Damage applied to each cell the drill head touches. */
  power: number;
  /** Max solid cells a missile may bore through. */
  depth: number;
  /** Child missiles spawned when depth is exhausted (0..4). */
  splits: number;
  /** Tunnel half-width in cells (0 = 1 wide, 1 = 3 wide). */
  radius: number;
  /** Seconds between shots. */
  cooldown: number;
  /** Max flight distance through air before fizzling. */
  range: number;
}

export interface Missile {
  x: number;
  y: number;
  /** Unit heading. */
  dx: number;
  dy: number;
  /** Distance flown through air. */
  travelled: number;
  /** Solid cells bored so far. */
  bored: number;
  /** Max solid cells for this missile. */
  depth: number;
  gen: number;
  alive: boolean;
}

const MAX_MISSILES = 48;
const MAX_GEN = 2;
const MAX_SUBSTEP = 0.5;
const FAN_RAD = (25 * Math.PI) / 180;

/**
 * Drill missiles: fly through air, bore through solid cells they can break,
 * stop at cells that survive their power, and optionally split into a fan of
 * shorter children. Deterministic; per-update work is bounded by
 * missiles * ceil(speed*dt/0.5) sub-steps.
 */
export class DrillLauncher {
  stats: DrillStats;
  cooldownLeft = 0;
  readonly missiles: Missile[] = [];
  /** Called when a missile ends (stopped, exhausted, fizzled or out of bounds). */
  onEnd: ((x: number, y: number) => void) | null = null;

  constructor(stats: DrillStats) {
    this.stats = stats;
  }

  get ready(): boolean {
    return this.cooldownLeft <= 0;
  }

  fire(ox: number, oy: number, tx: number, ty: number): boolean {
    if (!this.ready || this.missiles.length >= MAX_MISSILES) return false;
    let dx = tx - ox;
    let dy = ty - oy;
    const len = Math.hypot(dx, dy);
    if (len === 0) return false;
    dx /= len;
    dy /= len;
    this.missiles.push({
      x: ox, y: oy, dx, dy, travelled: 0, bored: 0,
      depth: Math.max(1, Math.floor(this.stats.depth)), gen: 0, alive: true,
    });
    this.cooldownLeft = this.stats.cooldown;
    return true;
  }

  update(world: World, dt: number): void {
    this.cooldownLeft = Math.max(0, this.cooldownLeft - dt);
    const n = this.missiles.length; // children spawned now start next update
    const dist = this.stats.speed * dt;
    const steps = Math.max(1, Math.ceil(dist / MAX_SUBSTEP));
    const step = dist / steps;
    for (let i = 0; i < n; i++) {
      const m = this.missiles[i];
      let lastCx = Math.floor(m.x);
      let lastCy = Math.floor(m.y);
      let inRock = world.getMat(lastCx, lastCy) !== Mat.Air;
      for (let s = 0; s < steps && m.alive; s++) {
        m.x += m.dx * step;
        m.y += m.dy * step;
        const cx = Math.floor(m.x);
        const cy = Math.floor(m.y);
        if (!world.inBounds(cx, cy)) {
          this.end(m);
          break;
        }
        if (cx !== lastCx || cy !== lastCy) {
          lastCx = cx;
          lastCy = cy;
          if (world.getMat(cx, cy) !== Mat.Air) {
            this.enterSolid(world, m, cx, cy);
            inRock = true;
          } else {
            inRock = false;
          }
        }
        // Only flight through pre-existing air counts toward range.
        if (m.alive && !inRock) {
          m.travelled += step;
          if (m.travelled >= this.stats.range) this.end(m);
        }
      }
    }
    let w = 0;
    for (let i = 0; i < this.missiles.length; i++) {
      const m = this.missiles[i];
      if (m.alive) this.missiles[w++] = m;
    }
    this.missiles.length = w;
  }

  private enterSolid(world: World, m: Missile, cx: number, cy: number): void {
    const r = Math.max(0, Math.floor(this.stats.radius));
    const power = this.stats.power;
    // Cells ahead of the head are skipped so every bored cell is counted once.
    for (let oy = -r; oy <= r; oy++) {
      for (let ox = -r; ox <= r; ox++) {
        if (ox === 0 && oy === 0) continue;
        if (ox * ox + oy * oy > r * r + r) continue;
        if (ox * m.dx + oy * m.dy > 0.5) continue;
        world.damage(cx + ox, cy + oy, power);
      }
    }
    world.damage(cx, cy, power);
    if (world.getMat(cx, cy) !== Mat.Air) {
      this.end(m); // too hard
      return;
    }
    m.bored++;
    if (m.bored >= m.depth) {
      if (m.gen < MAX_GEN) this.spawnSplits(m);
      this.end(m);
    }
  }

  private spawnSplits(p: Missile): void {
    const k = Math.max(0, Math.min(4, Math.floor(this.stats.splits)));
    const base = Math.atan2(p.dy, p.dx);
    const depth = Math.max(1, Math.floor(p.depth / 2));
    for (let i = 0; i < k; i++) {
      if (this.missiles.length >= MAX_MISSILES) return;
      const a = base + (k === 1 ? 0 : -FAN_RAD + (2 * FAN_RAD * i) / (k - 1));
      this.missiles.push({
        x: p.x, y: p.y, dx: Math.cos(a), dy: Math.sin(a),
        travelled: 0, bored: 0, depth, gen: p.gen + 1, alive: true,
      });
    }
  }

  private end(m: Missile): void {
    if (!m.alive) return;
    m.alive = false;
    this.onEnd?.(m.x, m.y);
  }
}
