import type { World } from '../world/World';
import { Mat } from '../world/materials';
import { CuttingLaser, type BeamResult } from '../weapons/CuttingLaser';
import { findTarget, type TargetResult } from './targeting';

export interface EmitterStats {
  dps: number;
  range: number;
}

const RETARGET_INTERVAL = 12;
const RAYS = 32;

/** Autonomous stationary laser that picks and cuts its own targets. Deterministic. */
export class Emitter {
  readonly x: number;
  readonly y: number;
  readonly laser: CuttingLaser;
  readonly beam: BeamResult = { endX: 0, endY: 0, hit: false };
  firing = false;
  private readonly target: TargetResult = { x: 0, y: 0, found: false };
  private sinceRetarget = 0;

  constructor(x: number, y: number, stats: EmitterStats) {
    this.x = x;
    this.y = y;
    this.laser = new CuttingLaser({ dps: stats.dps, range: stats.range, width: 1, pierce: 1 });
  }

  setStats(stats: EmitterStats): void {
    this.laser.stats.dps = stats.dps;
    this.laser.stats.range = stats.range;
  }

  update(world: World, dt: number, materialAware: boolean): void {
    const t = this.target;
    // Retarget at once when the current target is gone; otherwise (including
    // when nothing was found) only every RETARGET_INTERVAL updates, so idle
    // emitters do not rescan every tick.
    const lost = t.found && world.getMat(Math.floor(t.x), Math.floor(t.y)) === Mat.Air;
    if (lost || ++this.sinceRetarget >= RETARGET_INTERVAL) {
      this.sinceRetarget = 0;
      findTarget(world, this.x, this.y, this.laser.stats.range, RAYS, materialAware, t);
    }
    this.firing = t.found;
    if (t.found) {
      this.laser.fire(world, this.x, this.y, t.x, t.y, dt, this.beam);
    } else {
      this.beam.hit = false;
    }
  }
}
