import { World } from '../world/World';
import { Mat } from '../world/materials';
import { traverseGrid } from '../world/raycast';

export interface LaserStats {
  /** Damage per second applied to each hit cell. */
  dps: number;
  /** Max beam length in cells. */
  range: number;
  /** Number of parallel beam lanes (1 = single-cell width). */
  width: number;
  /** Solid cells a single lane can damage simultaneously. */
  pierce: number;
}

export const DEFAULT_LASER: LaserStats = { dps: 90, range: 70, width: 1, pierce: 1 };

export interface BeamResult {
  /** End point of the central lane in cell coordinates. */
  endX: number;
  endY: number;
  /** Whether the central lane hit something solid. */
  hit: boolean;
}

/**
 * Continuous directional beam. Damage is accumulated as a float and applied
 * as integers so low dps works at any tick rate.
 */
export class CuttingLaser {
  stats: LaserStats;
  private carry = 0;

  constructor(stats: LaserStats = { ...DEFAULT_LASER }) {
    this.stats = stats;
  }

  /**
   * Fires for one simulation step. (ox, oy) and the target are in cell
   * coordinates. Work is bounded by width * range cells.
   */
  fire(world: World, ox: number, oy: number, tx: number, ty: number, dt: number, out: BeamResult): void {
    const s = this.stats;
    let dx = tx - ox;
    let dy = ty - oy;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const range = Math.min(s.range, len);

    this.carry += s.dps * dt;
    const dmg = Math.floor(this.carry);
    this.carry -= dmg;

    // Perpendicular offsets for multi-lane width, centre lane first.
    const px = -dy;
    const py = dx;
    out.hit = false;
    out.endX = ox + dx * range;
    out.endY = oy + dy * range;
    for (let lane = 0; lane < s.width; lane++) {
      const off = lane === 0 ? 0 : (lane % 2 === 1 ? 1 : -1) * Math.ceil(lane / 2) * 0.9;
      const lx = ox + px * off;
      const ly = oy + py * off;
      let remaining = s.pierce;
      const dist = traverseGrid(lx, ly, dx, dy, range, (cx, cy) => {
        if (world.getMat(cx, cy) === Mat.Air) return true;
        if (dmg > 0) world.damage(cx, cy, dmg);
        remaining--;
        return remaining > 0;
      });
      if (lane === 0 && remaining < s.pierce) {
        out.hit = true;
        out.endX = ox + dx * dist;
        out.endY = oy + dy * dist;
      }
    }
  }
}
