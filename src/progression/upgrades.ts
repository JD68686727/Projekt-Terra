export type UpgradeId =
  | 'laserDamage'
  | 'laserWidth'
  | 'laserRange'
  | 'laserPierce'
  | 'mpMultiplier'
  | 'droneSpeed'
  | 'pulseUnlock'
  | 'pulseDamage'
  | 'pulseRadius'
  | 'pulseCooldown';

export type UpgradeGroup = 'laser' | 'pulse' | 'core';

export interface UpgradeDef {
  readonly id: UpgradeId;
  readonly group: UpgradeGroup;
  readonly name: string;
  readonly desc: string;
  readonly baseCost: number;
  readonly growth: number;
  readonly maxLevel: number;
  /** Must own at least level 1 of this upgrade to buy. */
  readonly requires?: UpgradeId;
}

export const UPGRADES: readonly UpgradeDef[] = [
  { id: 'laserDamage', group: 'laser', name: 'Laser-Leistung', desc: '+30 % Schaden', baseCost: 40, growth: 1.9, maxLevel: 25 },
  { id: 'laserWidth', group: 'laser', name: 'Strahlbreite', desc: '+1 Strahlbahn', baseCost: 400, growth: 3.2, maxLevel: 6 },
  { id: 'laserRange', group: 'laser', name: 'Reichweite', desc: '+12 Zellen', baseCost: 70, growth: 2.1, maxLevel: 8 },
  { id: 'laserPierce', group: 'laser', name: 'Durchschlag', desc: '+1 Zelle gleichzeitig', baseCost: 500, growth: 3.0, maxLevel: 5 },
  { id: 'mpMultiplier', group: 'core', name: 'MP-Raffinerie', desc: '+25 % Material Points', baseCost: 500, growth: 2.4, maxLevel: 15 },
  { id: 'droneSpeed', group: 'core', name: 'Antrieb', desc: '+15 % Fluggeschwindigkeit', baseCost: 150, growth: 2.2, maxLevel: 6 },
  { id: 'pulseUnlock', group: 'pulse', name: 'Pulse Cannon', desc: 'Schaltet die Schockwellen-Kanone frei [2]', baseCost: 1500, growth: 1, maxLevel: 1 },
  { id: 'pulseDamage', group: 'pulse', name: 'Pulse-Schaden', desc: '+35 % Schaden', baseCost: 400, growth: 1.8, maxLevel: 20, requires: 'pulseUnlock' },
  { id: 'pulseRadius', group: 'pulse', name: 'Pulse-Radius', desc: '+2 Zellen Radius', baseCost: 500, growth: 2.1, maxLevel: 8, requires: 'pulseUnlock' },
  { id: 'pulseCooldown', group: 'pulse', name: 'Pulse-Ladezeit', desc: '−15 % Abklingzeit', baseCost: 450, growth: 2.0, maxLevel: 8, requires: 'pulseUnlock' },
];

export const UPGRADE_BY_ID: Readonly<Record<UpgradeId, UpgradeDef>> = Object.fromEntries(
  UPGRADES.map((u) => [u.id, u]),
) as Record<UpgradeId, UpgradeDef>;

export function upgradeCost(def: UpgradeDef, level: number): number {
  return Math.round(def.baseCost * Math.pow(def.growth, level));
}
