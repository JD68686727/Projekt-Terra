import { World } from '../world/World';
import { Mat } from '../world/materials';

/** Player rig. Position is its centre in cell units; collides with terrain. */
export class Drone {
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  readonly half = 1.5; // 3×3 cell hitbox
  speed = 32; // cells/s

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  update(world: World, ax: number, ay: number, dt: number): void {
    const len = Math.hypot(ax, ay);
    if (len > 1) {
      ax /= len;
      ay /= len;
    }
    const k = 1 - Math.exp(-dt * 12);
    this.vx += (ax * this.speed - this.vx) * k;
    this.vy += (ay * this.speed - this.vy) * k;
    this.moveAxis(world, this.vx * dt, 0);
    this.moveAxis(world, 0, this.vy * dt);
    // Keep within world bounds.
    this.x = Math.min(world.width - this.half, Math.max(this.half, this.x));
    this.y = Math.min(world.height - this.half, Math.max(this.half, this.y));
  }

  /** Sub-stepped axis movement so fast moves never tunnel through cells. */
  private moveAxis(world: World, dx: number, dy: number): void {
    const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 0.4) || 1;
    const sx = dx / steps;
    const sy = dy / steps;
    for (let i = 0; i < steps; i++) {
      const nx = this.x + sx;
      const ny = this.y + sy;
      if (this.collides(world, nx, ny)) {
        if (sx) this.vx = 0;
        if (sy) this.vy = 0;
        return;
      }
      this.x = nx;
      this.y = ny;
    }
  }

  collides(world: World, cx: number, cy: number): boolean {
    const h = this.half - 0.01;
    const x0 = Math.floor(cx - h);
    const x1 = Math.floor(cx + h);
    const y0 = Math.floor(cy - h);
    const y1 = Math.floor(cy + h);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (world.getMat(x, y) !== Mat.Air) return true;
    return false;
  }
}
