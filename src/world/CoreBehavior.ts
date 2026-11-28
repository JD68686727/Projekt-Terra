import type { CoreSite } from './generator';
import { Mat } from './materials';
import type { World } from './World';

/** One behaviour per biome: the core is an opponent, not just a hit-point bag. */
export type CoreMode = 'pulse' | 'heat' | 'regrow' | 'phases' | 'gap';

const MODES: CoreMode[] = ['pulse', 'heat', 'regrow', 'phases', 'gap'];

export function coreModeFor(biome: number): CoreMode {
  return MODES[Math.max(0, Math.floor(biome)) % MODES.length];
}

export const CORE_HINTS: Record<CoreMode, string> = {
  pulse: 'PULS-SCHILD: nur im offenen Fenster verwundbar – Schaden bündeln!',
  heat: 'ÜBERHITZUNG: Dauerfeuer lässt den Kern entlüften – kurze Feuerpausen halten ihn verwundbar!',
  regrow: 'REGENERATION: Der Kern heilt sich, wenn du nicht schnell genug bist!',
  phases: 'PHASENWECHSEL: bei 2/3 und 1/3 Kernmasse erstarrt der Kern kurz in einer Frostnova!',
  gap: 'ROTIERENDE LÜCKE: Nur der helle Bogen ist schwach – dort treffen!',
};

/** Per-core runtime state (not saved: a loaded world simply restarts the pattern). */
export interface CoreDyn {
  mode: CoreMode;
  /** Current damage multiplier (> 1 = weak spot / open, < 1 = shielded). */
  mult: number;
  /** Seconds since the core last took damage. */
  idle: number;
  heat: number;
  /** > 0 while invulnerable/venting (seconds left). */
  lock: number;
  phase: number;
  gapAngle: number;
  /** Original core cells (for regrowth). */
  cells: Int32Array | null;
  regrowAcc: number;
  hinted: boolean;
}

export interface CoreHooks {
  /** A visible event (vent, frost nova, ...) for particles/shake/sound. */
  event(core: number, kind: 'vent' | 'nova' | 'regrow'): void;
  /** One core cell was restored. */
  regrown(core: number): void;
}

export const PULSE_PERIOD = 8;
export const PULSE_OPEN = 3;
export const GAP_WIDTH = (70 * Math.PI) / 180;
const GAP_SPEED = (25 * Math.PI) / 180;

export class CoreBehavior {
  readonly dyn: CoreDyn[] = [];
  private clock = 0;

  constructor(
    private readonly sites: CoreSite[],
    readonly mode: CoreMode,
    world: World,
  ) {
    for (const s of sites) {
      let cells: Int32Array | null = null;
      if (mode === 'regrow') {
        const list: number[] = [];
        for (let y = s.y - s.radius; y <= s.y + s.radius; y++)
          for (let x = s.x - s.radius; x <= s.x + s.radius; x++) if (world.getMat(x, y) === Mat.CoreMaterial) list.push(x, y);
        cells = Int32Array.from(list);
      }
      this.dyn.push({ mode, mult: 1, idle: 99, heat: 0, lock: 0, phase: 0, gapAngle: Math.random() * Math.PI * 2, cells, regrowAcc: 0, hinted: false });
    }
  }

  /** Damage multiplier at a cell (the gap mode depends on the angle around the core). */
  multAt(core: number, x: number, y: number): number {
    const d = this.dyn[core];
    if (d.mode !== 'gap') return d.mult;
    const s = this.sites[core];
    let diff = Math.atan2(y - s.y, x - s.x) - d.gapAngle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    return Math.abs(diff) < GAP_WIDTH / 2 ? 3 : 0.5;
  }

  /** Index of the core a cell belongs to, or -1. */
  coreAt(x: number, y: number): number {
    for (let i = 0; i < this.sites.length; i++) {
      const c = this.sites[i];
      const r = c.radius + 1;
      if (Math.abs(x - c.x) <= r && Math.abs(y - c.y) <= r) return i;
    }
    return -1;
  }

  /** Called when a core cell took damage (heat accounting). */
  damaged(core: number): void {
    const d = this.dyn[core];
    if (d) d.idle = 0;
  }

  /** Fixed-step update; all work is bounded (a few cells per core per step). */
  update(h: number, world: World, remaining: readonly { remaining: number; total: number }[], hooks: CoreHooks): void {
    this.clock += h;
    for (let i = 0; i < this.dyn.length; i++) {
      const d = this.dyn[i];
      const st = remaining[i];
      if (st.remaining === 0) {
        d.mult = 1;
        continue;
      }
      d.idle += h;
      if (d.lock > 0) d.lock = Math.max(0, d.lock - h);
      switch (d.mode) {
        case 'pulse': {
          // Phase offset per core so they do not all beat in sync.
          const t = (this.clock + i * 2.5) % PULSE_PERIOD;
          d.mult = t < PULSE_OPEN ? 1.8 : 0.45;
          break;
        }
        case 'heat': {
          if (d.lock > 0) {
            d.mult = 0.25;
          } else {
            d.mult = 1.25;
            d.heat = d.idle < 0.3 ? Math.min(1, d.heat + h / 6) : Math.max(0, d.heat - h / 3);
            if (d.heat >= 1) {
              d.lock = 3;
              d.heat = 0.3;
              hooks.event(i, 'vent');
            }
          }
          break;
        }
        case 'regrow': {
          d.mult = 1;
          if (d.idle > 2 && d.cells && st.remaining < st.total) {
            d.regrowAcc += h * 3;
            while (d.regrowAcc >= 1) {
              d.regrowAcc -= 1;
              // Restore the first missing original cell (bounded scan).
              for (let k = 0; k < d.cells.length; k += 2) {
                const x = d.cells[k];
                const y = d.cells[k + 1];
                if (world.getMat(x, y) === Mat.Air) {
                  world.setMat(x, y, Mat.CoreMaterial);
                  hooks.regrown(i);
                  break;
                }
              }
            }
          }
          break;
        }
        case 'phases': {
          const frac = st.remaining / st.total;
          if (d.lock > 0) d.mult = 1 / 6;
          else {
            d.mult = 1;
            if ((d.phase === 0 && frac <= 2 / 3) || (d.phase === 1 && frac <= 1 / 3)) {
              d.phase++;
              d.lock = 4;
              d.mult = 1 / 6;
              hooks.event(i, 'nova');
            }
          }
          break;
        }
        case 'gap':
          d.gapAngle += GAP_SPEED * h;
          d.mult = 1;
          break;
      }
    }
  }
}
