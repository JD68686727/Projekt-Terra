import { UPGRADES, UPGRADE_BY_ID, UpgradeId, upgradeCost, Currency } from './upgrades';
import type { LaserStats } from '../weapons/CuttingLaser';
import type { PulseStats } from '../weapons/PulseCannon';
import type { ReactionStats } from '../world/Reactions';
import type { EmitterStats } from '../automation/Emitter';
import type { DrillStats } from '../weapons/DrillMissile';
import type { SwarmStats } from '../weapons/NanoSwarm';
import type { FractureStats } from '../weapons/FractureCharge';

/** Resonance Fragments per crystal cell consumed by a resonance chain. */
export const RF_PER_RESONANCE = 0.15;

export type BuyResult = 'ok' | 'maxed' | 'locked' | 'insufficient';

/** Wallet + upgrade levels, and derivation of gameplay stats from them. */
export class Progression {
  mp = 0;
  totalMp = 0;
  /** Resonance Fragments (special currency, earned from resonance chains). */
  rf = 0;
  totalRf = 0;
  /** Echo fragments (earned by breaking a world, spent on permanent Echo upgrades). */
  echo = 0;
  /** Completed runs; each grants a permanent +50 % MP bonus. */
  prestige = 0;
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

  currency(id: UpgradeId): Currency {
    return UPGRADE_BY_ID[id].currency ?? 'mp';
  }

  check(id: UpgradeId): BuyResult {
    if (this.isMaxed(id)) return 'maxed';
    if (this.isLocked(id)) return 'locked';
    if (this[this.currency(id)] < this.cost(id)) return 'insufficient';
    return 'ok';
  }

  buy(id: UpgradeId): BuyResult {
    const r = this.check(id);
    if (r !== 'ok') return r;
    this[this.currency(id)] -= this.cost(id);
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

  earnRf(amount: number): void {
    const a = amount * (1 + 0.25 * this.levels.echoRf);
    this.rf += a;
    this.totalRf += a;
  }

  /** Echo fragments for breaking a world with `cores` cores. */
  echoAward(cores: number): number {
    return cores * 2 + this.prestige;
  }

  /** Material Points a fresh world starts with (Echo-Vorrat). */
  echoStartMp(): number {
    return 1500 * this.levels.echoStart * this.levels.echoStart;
  }

  reactionStats(): ReactionStats {
    const l = this.levels;
    return {
      resonanceDepth: 4 + 4 * l.resonanceDepth,
      oreChance: Math.min(0.9, 0.25 + 0.08 * l.oreVolatility),
      oreRadius: 2.5 + 0.5 * l.oreVolatility,
      oreDamage: 45 * Math.pow(1.25, l.oreVolatility),
    };
  }

  autoTargetUnlocked(): boolean {
    return this.levels.autoTarget > 0;
  }

  materialAware(): boolean {
    return this.levels.smartTarget > 0;
  }

  maxEmitters(): number {
    return this.levels.emitterUnlock > 0 ? 1 + this.levels.emitterCount : 0;
  }

  emitterStats(): EmitterStats {
    return { dps: 90 * Math.pow(1.3, this.levels.emitterPower) * (1 + 0.3 * this.levels.echoEmitter), range: 40 };
  }

  mpMultiplier(): number {
    return (1 + 0.25 * this.levels.mpMultiplier) * (1 + 0.5 * this.prestige) * (1 + 0.2 * this.levels.echoMp);
  }

  droneSpeed(): number {
    return 32 * (1 + 0.15 * this.levels.droneSpeed) * (1 + 0.1 * this.levels.echoDrone);
  }

  laserStats(): LaserStats {
    const l = this.levels;
    return {
      dps: 160 * Math.pow(1.3, l.laserDamage) * (1 + 0.2 * l.echoLaser),
      range: 60 + 12 * l.laserRange,
      width: 1 + l.laserWidth,
      pierce: 1 + l.laserPierce,
    };
  }

  drillUnlocked(): boolean {
    return this.levels.drillUnlock > 0;
  }

  drillStats(): DrillStats {
    const l = this.levels;
    return {
      speed: 70,
      power: 60 * Math.pow(1.35, l.drillPower) * (1 + 0.2 * l.echoBlast),
      depth: 25 + 12 * l.drillDepth,
      splits: l.drillSplit,
      radius: l.drillPower >= 5 ? 1 : 0,
      cooldown: 1.2 * Math.pow(0.85, l.drillCooldown),
      range: 120,
    };
  }

  nanoUnlocked(): boolean {
    return this.levels.nanoUnlock > 0;
  }

  swarmStats(): SwarmStats {
    const l = this.levels;
    return { count: Math.min(64, 6 + 3 * l.nanoCount), dps: 25 * Math.pow(1.3, l.nanoPower) * (1 + 0.2 * l.echoBlast), leash: 18 + 5 * l.nanoLeash, speed: 22 };
  }

  fractureUnlocked(): boolean {
    return this.levels.fractureUnlock > 0;
  }

  fractureStats(): FractureStats {
    const l = this.levels;
    return {
      // Energy (decay) shapes the crater; maxCells is only a safety cap.
      maxCells: Math.round(900 * Math.pow(1.5, l.fractureReach)),
      damage: 400 * Math.pow(1.4, l.fractureDamage) * (1 + 0.2 * l.echoBlast),
      decay: 0.1 * Math.pow(0.86, l.fractureReach),
      fuse: 1.2,
      cooldown: 6 * Math.pow(0.85, l.fractureCooldown),
      range: 70,
    };
  }

  pulseUnlocked(): boolean {
    return this.levels.pulseUnlock > 0;
  }

  pulseStats(): PulseStats {
    const l = this.levels;
    return {
      damage: 70 * Math.pow(1.35, l.pulseDamage) * (1 + 0.2 * l.echoBlast),
      radius: 6 + 2 * l.pulseRadius,
      cooldown: 1.6 * Math.pow(0.85, l.pulseCooldown),
      range: 50 + 6 * l.pulseRadius,
    };
  }
}
