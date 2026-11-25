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
  | 'pulseCooldown'
  | 'resonanceDepth'
  | 'oreVolatility'
  | 'autoTarget'
  | 'smartTarget'
  | 'autoPulse'
  | 'autoDrill'
  | 'emitterUnlock'
  | 'emitterCount'
  | 'emitterPower'
  | 'drillUnlock'
  | 'drillPower'
  | 'drillDepth'
  | 'drillSplit'
  | 'drillCooldown'
  | 'nanoUnlock'
  | 'nanoCount'
  | 'nanoPower'
  | 'nanoLeash'
  | 'fractureUnlock'
  | 'fractureReach'
  | 'fractureDamage'
  | 'fractureCooldown'
  | 'echoMp'
  | 'echoStart'
  | 'echoLaser'
  | 'echoDrone'
  | 'echoRf'
  | 'echoBlast'
  | 'echoEmitter'
  | 'echoMemory';

export type UpgradeGroup = 'laser' | 'pulse' | 'drill' | 'nano' | 'fracture' | 'resonance' | 'auto' | 'core' | 'echo';
export type Currency = 'mp' | 'rf' | 'echo';

export interface UpgradeDef {
  readonly id: UpgradeId;
  readonly group: UpgradeGroup;
  readonly name: string;
  readonly desc: string;
  readonly baseCost: number;
  readonly growth: number;
  readonly maxLevel: number;
  /** Defaults to Material Points. */
  readonly currency?: Currency;
  /** Must own at least level 1 of this upgrade to buy. */
  readonly requires?: UpgradeId;
}

export const UPGRADES: readonly UpgradeDef[] = [
  { id: 'laserDamage', group: 'laser', name: 'Laser-Leistung', desc: '+30 % Schaden', baseCost: 40, growth: 2.25, maxLevel: 25 },
  { id: 'laserWidth', group: 'laser', name: 'Strahlbreite', desc: '+1 Strahlbahn', baseCost: 400, growth: 3.6, maxLevel: 6 },
  { id: 'laserRange', group: 'laser', name: 'Reichweite', desc: '+12 Zellen', baseCost: 70, growth: 2.3, maxLevel: 8 },
  { id: 'laserPierce', group: 'laser', name: 'Durchschlag', desc: '+1 Zelle gleichzeitig', baseCost: 500, growth: 3.5, maxLevel: 5 },
  { id: 'resonanceDepth', group: 'resonance', name: 'Resonanz-Reichweite', desc: '+4 Kettenglieder durch Kristalladern', baseCost: 550, growth: 1.9, maxLevel: 10 },
  { id: 'oreVolatility', group: 'resonance', name: 'Erz-Instabilität', desc: 'Erz explodiert öfter und größer', baseCost: 450, growth: 1.85, maxLevel: 8 },
  { id: 'autoTarget', group: 'auto', name: 'Autopilot', desc: 'Drohne trägt die Schichten von oben nach unten ab und arbeitet sich zum Kern vor [T]', baseCost: 20, growth: 1, maxLevel: 1, currency: 'rf' },
  { id: 'smartTarget', group: 'auto', name: 'Materialerkennung', desc: 'Laser und Autopilot bevorzugen wertvolles Material', baseCost: 1800, growth: 1, maxLevel: 1, requires: 'autoTarget' },
  { id: 'autoPulse', group: 'auto', name: 'Auto-Pulse', desc: 'Autopilot löst den Pulse selbst aus, sobald er geladen ist', baseCost: 3500, growth: 1, maxLevel: 1, requires: 'pulseUnlock' },
  { id: 'autoDrill', group: 'auto', name: 'Auto-Bohrer', desc: 'Autopilot feuert Bohrraketen in Flugrichtung, wenn der Weg blockiert ist', baseCost: 5500, growth: 1, maxLevel: 1, requires: 'drillUnlock' },
  { id: 'emitterUnlock', group: 'auto', name: 'Laser-Emitter', desc: 'Stationärer Auto-Laser [E] platziert', baseCost: 25, growth: 1, maxLevel: 1, currency: 'rf' },
  { id: 'emitterCount', group: 'auto', name: 'Emitter-Slots', desc: '+1 Emitter', baseCost: 40, growth: 1.8, maxLevel: 5, currency: 'rf', requires: 'emitterUnlock' },
  { id: 'emitterPower', group: 'auto', name: 'Emitter-Leistung', desc: '+30 % Emitter-Schaden', baseCost: 700, growth: 2.1, maxLevel: 20, requires: 'emitterUnlock' },
  { id: 'mpMultiplier', group: 'core', name: 'MP-Raffinerie', desc: '+25 % Material Points', baseCost: 500, growth: 2.7, maxLevel: 15 },
  { id: 'droneSpeed', group: 'core', name: 'Antrieb', desc: '+15 % Fluggeschwindigkeit', baseCost: 150, growth: 2.2, maxLevel: 6 },
  { id: 'pulseUnlock', group: 'pulse', name: 'Pulse Cannon', desc: 'Schaltet die Schockwellen-Kanone frei [2]', baseCost: 1500, growth: 1, maxLevel: 1 },
  { id: 'pulseDamage', group: 'pulse', name: 'Pulse-Schaden', desc: '+35 % Schaden', baseCost: 400, growth: 2.1, maxLevel: 20, requires: 'pulseUnlock' },
  { id: 'pulseRadius', group: 'pulse', name: 'Pulse-Radius', desc: '+2 Zellen Radius', baseCost: 500, growth: 2.1, maxLevel: 8, requires: 'pulseUnlock' },
  { id: 'pulseCooldown', group: 'pulse', name: 'Pulse-Ladezeit', desc: '−15 % Abklingzeit', baseCost: 450, growth: 2.0, maxLevel: 8, requires: 'pulseUnlock' },
  { id: 'drillUnlock', group: 'drill', name: 'Drill Missile', desc: 'Bohrrakete freischalten [3]', baseCost: 2500, growth: 1, maxLevel: 1 },
  { id: 'drillPower', group: 'drill', name: 'Bohrkopf', desc: '+35 % Bohrkraft (ab Stufe 5: breiter Tunnel)', baseCost: 600, growth: 2.0, maxLevel: 15, requires: 'drillUnlock' },
  { id: 'drillDepth', group: 'drill', name: 'Bohrtiefe', desc: '+12 Zellen Tiefe', baseCost: 500, growth: 1.9, maxLevel: 12, requires: 'drillUnlock' },
  { id: 'drillSplit', group: 'drill', name: 'Splitterköpfe', desc: '+1 Teilrakete am Tunnelende', baseCost: 30, growth: 2.2, maxLevel: 4, currency: 'rf', requires: 'drillUnlock' },
  { id: 'drillCooldown', group: 'drill', name: 'Nachlader', desc: '−15 % Nachladezeit', baseCost: 700, growth: 2.0, maxLevel: 8, requires: 'drillUnlock' },
  { id: 'nanoUnlock', group: 'nano', name: 'Nano Swarm', desc: 'Schwarm freischalten [4], Klick setzt Einsatzgebiet', baseCost: 40, growth: 1, maxLevel: 1, currency: 'rf' },
  { id: 'nanoCount', group: 'nano', name: 'Schwarmgröße', desc: '+3 Nanos', baseCost: 25, growth: 1.7, maxLevel: 12, currency: 'rf', requires: 'nanoUnlock' },
  { id: 'nanoPower', group: 'nano', name: 'Nano-Schneider', desc: '+30 % Nano-Schaden', baseCost: 900, growth: 2.0, maxLevel: 15, requires: 'nanoUnlock' },
  { id: 'nanoLeash', group: 'nano', name: 'Einsatzradius', desc: '+5 Zellen Radius', baseCost: 800, growth: 2.0, maxLevel: 6, requires: 'nanoUnlock' },
  { id: 'fractureUnlock', group: 'fracture', name: 'Fracture Charge', desc: 'Bruchladung freischalten [5]', baseCost: 80, growth: 1, maxLevel: 1, currency: 'rf' },
  { id: 'fractureReach', group: 'fracture', name: 'Bruchausbreitung', desc: '+50 % Reichweite & Verzweigung', baseCost: 2000, growth: 2.1, maxLevel: 10, requires: 'fractureUnlock' },
  { id: 'fractureDamage', group: 'fracture', name: 'Bruchenergie', desc: '+40 % Schaden', baseCost: 1500, growth: 2.1, maxLevel: 12, requires: 'fractureUnlock' },
  { id: 'fractureCooldown', group: 'fracture', name: 'Schnellzünder', desc: '−15 % Abklingzeit', baseCost: 40, growth: 2.0, maxLevel: 6, currency: 'rf', requires: 'fractureUnlock' },
  // Echo upgrades: bought with Echo fragments (earned by breaking a world); they persist into every new world.
  { id: 'echoMp', group: 'echo', name: 'Echo-Raffinerie', desc: 'Permanent +20 % Material Points', baseCost: 3, growth: 1.7, maxLevel: 10, currency: 'echo' },
  { id: 'echoLaser', group: 'echo', name: 'Echo-Laser', desc: 'Permanent +20 % Laserschaden', baseCost: 3, growth: 1.7, maxLevel: 10, currency: 'echo' },
  { id: 'echoStart', group: 'echo', name: 'Echo-Vorrat', desc: 'Neue Welten starten mit Material Points', baseCost: 4, growth: 2.0, maxLevel: 5, currency: 'echo' },
  { id: 'echoDrone', group: 'echo', name: 'Echo-Antrieb', desc: 'Permanent +10 % Fluggeschwindigkeit', baseCost: 5, growth: 1.9, maxLevel: 5, currency: 'echo' },
  { id: 'echoRf', group: 'echo', name: 'Echo-Resonanz', desc: 'Permanent +25 % Resonance Fragments', baseCost: 6, growth: 1.9, maxLevel: 5, currency: 'echo' },
  { id: 'echoBlast', group: 'echo', name: 'Echo-Sprengkraft', desc: 'Permanent +20 % Schaden von Pulse, Bohrer, Nano und Bruchladung', baseCost: 5, growth: 1.8, maxLevel: 8, currency: 'echo' },
  { id: 'echoEmitter', group: 'echo', name: 'Echo-Emitter', desc: 'Permanent +30 % Emitter-Schaden', baseCost: 4, growth: 1.8, maxLevel: 5, currency: 'echo' },
  { id: 'echoMemory', group: 'echo', name: 'Echo-Gedächtnis', desc: 'Autopilot ist in jeder neuen Welt sofort freigeschaltet', baseCost: 12, growth: 1, maxLevel: 1, currency: 'echo' },
];

/** Upgrades that carry over into each new world (Echo). */
export const ECHO_IDS: readonly UpgradeId[] = ['echoMp', 'echoLaser', 'echoStart', 'echoDrone', 'echoRf', 'echoBlast', 'echoEmitter', 'echoMemory'];

export const UPGRADE_BY_ID: Readonly<Record<UpgradeId, UpgradeDef>> = Object.fromEntries(
  UPGRADES.map((u) => [u.id, u]),
) as Record<UpgradeId, UpgradeDef>;

export function upgradeCost(def: UpgradeDef, level: number): number {
  return Math.round(def.baseCost * Math.pow(def.growth, level));
}
