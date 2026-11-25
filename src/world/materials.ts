// Material table. Ids are stored in Uint8Array terrain data — never reorder.
export const enum Mat {
  Air = 0,
  Stone = 1,
  DenseRock = 2,
  ResonanceCrystal = 3,
  UnstableOre = 4,
  TitaniumMatrix = 5,
  CoreMaterial = 6,
  /** Echo biome ore (Rote Wüste): ignites neighbouring cells when destroyed. */
  Glutstein = 7,
  /** Echo biome ore (Goldene Kruste): very valuable, in hard rock. */
  GoldVein = 8,
}

export interface MaterialDef {
  readonly id: Mat;
  readonly name: string;
  /** Hit points of one cell. */
  readonly durability: number;
  /** Material Points awarded per destroyed cell. */
  readonly value: number;
  /** Base RGB colour (0xRRGGBB). */
  readonly color: number;
  /** Per-cell brightness variation amplitude (0..1). */
  readonly variation: number;
  /** Self-illuminated materials ignore depth shading. */
  readonly emissive: boolean;
}

export const MATERIALS: readonly MaterialDef[] = [
  { id: Mat.Air, name: 'Air', durability: 0, value: 0, color: 0x000000, variation: 0, emissive: false },
  { id: Mat.Stone, name: 'Stone', durability: 20, value: 1, color: 0x5a5560, variation: 0.12, emissive: false },
  { id: Mat.DenseRock, name: 'Dense Rock', durability: 60, value: 3, color: 0x38343f, variation: 0.1, emissive: false },
  { id: Mat.ResonanceCrystal, name: 'Resonance Crystal', durability: 40, value: 12, color: 0x29d8f0, variation: 0.25, emissive: true },
  { id: Mat.UnstableOre, name: 'Unstable Ore', durability: 30, value: 8, color: 0xf07a22, variation: 0.22, emissive: true },
  { id: Mat.TitaniumMatrix, name: 'Titanium Matrix', durability: 2500, value: 40, color: 0x8c9bb0, variation: 0.06, emissive: false },
  { id: Mat.CoreMaterial, name: 'Core Material', durability: 20000, value: 50, color: 0xd040ff, variation: 0.3, emissive: true },
  { id: Mat.Glutstein, name: 'Glutstein', durability: 35, value: 14, color: 0xe03a30, variation: 0.22, emissive: true },
  { id: Mat.GoldVein, name: 'Gold Vein', durability: 90, value: 28, color: 0xf2c33c, variation: 0.18, emissive: false },
];

export const MATERIAL_COUNT = MATERIALS.length;

export function isSolid(m: number): boolean {
  return m !== Mat.Air;
}
