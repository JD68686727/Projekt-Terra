/**
 * Fixed-timestep simulation driver with bounded catch-up. Rendering runs once
 * per animation frame; the simulation runs at a fixed rate independent of it.
 */
export class FixedLoop {
  readonly step: number;
  readonly maxSteps: number;
  private acc = 0;

  constructor(hz = 60, maxSteps = 5) {
    this.step = 1 / hz;
    this.maxSteps = maxSteps;
  }

  /**
   * Advances by a real-time delta (seconds), calling tick() for each step.
   * Returns the number of steps run. Excess time beyond maxSteps is dropped
   * so a long stall never causes a spiral of death.
   */
  advance(dt: number, tick: (step: number) => void): number {
    this.acc += Math.min(Math.max(dt, 0), 0.25);
    let n = 0;
    while (this.acc >= this.step && n < this.maxSteps) {
      tick(this.step);
      this.acc -= this.step;
      n++;
    }
    if (n === this.maxSteps) this.acc = 0;
    return n;
  }

  /** Interpolation factor for rendering between steps. */
  get alpha(): number {
    return this.acc / this.step;
  }

  reset(): void {
    this.acc = 0;
  }
}
