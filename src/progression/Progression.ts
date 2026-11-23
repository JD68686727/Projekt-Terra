import { UPGRADES, UPGRADE_BY_ID, UpgradeId, upgradeCost } from './upgrades';
import type { LaserStats } from '../weapons/CuttingLaser';
import type { PulseStats } from '../weapons/PulseCannon';

export type BuyResult = 'ok' | 'maxed' | 'locked' | 'insufficient';

/** Wallet + upgrade levels, and derivation of gameplay stats from them. */
export class Progression {
  mp = 0;
  totalMp = 0;
  readonly levels: Record<UpgradeId, number>;
  onChange: (() => void) | null = null;

  constructor() {
    this.levels = Object.fromEntries(UPGRADES.map((u) => [u.id, 0])) as Record<UpgradeId, number>;
  }

  level(id: UpgradeId): number {
    return this.levels[id];
  }

  cost(id: UpgradeId): number {
    return upgradeCost(UPGRADE_BY_ID[id], this.levels[id]);
  }

  isMaxed(id: UpgradeId): boolean {
    return this.levels[id] >= UPGRADE_BY_ID[id].maxLevel;
  }

  isLocked(id: UpgradeId): boolean {
    const req = UPGRADE_BY_ID[id].requires;
    return !!req && this.levels[req] < 1;
  }

  check(id: UpgradeId): BuyResult {
    if (this.isMaxed(id)) return 'maxed';
    if (this.isLocked(id)) return 'locked';
    if (this.mp < this.cost(id)) return 'insufficient';
    return 'ok';
  }

  buy(id: UpgradeId): BuyResult {
    const r = this.check(id);
    if (r !== 'ok') return r;
    this.mp -= this.cost(id);
    this.levels[id]++;
    this.onChange?.();
    return 'ok';
  }

  /** Adds raw material value, applying the MP multiplier. */
  earn(rawValue: number): number {
    const gained = rawValue * this.mpMultiplier();
    this.mp += gained;
    this.totalMp += gained;
    return gained;
  }

  mpMultiplier(): number {
    return 1 + 0.25 * this.levels.mpMultiplier;
  }

  droneSpeed(): number {
    return 32 * (1 + 0.15 * this.levels.droneSpeed);
  }

  laserStats(): LaserStats {
    const l = this.levels;
    return {
      dps: 160 * Math.pow(1.3, l.laserDamage),
      range: 60 + 12 * l.laserRange,
      width: 1 + l.laserWidth,
      pierce: 1 + l.laserPierce,
    };
  }

  pulseUnlocked(): boolean {
    return this.levels.pulseUnlock > 0;
  }

  pulseStats(): PulseStats {
    const l = this.levels;
    return {
      damage: 70 * Math.pow(1.35, l.pulseDamage),
      radius: 6 + 2 * l.pulseRadius,
      cooldown: 1.6 * Math.pow(0.85, l.pulseCooldown),
      range: 50 + 6 * l.pulseRadius,
    };
  }
}
