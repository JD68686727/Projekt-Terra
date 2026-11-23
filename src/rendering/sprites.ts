import { BufferImageSource, Texture } from 'pixi.js';

/**
 * Hand-drawn pixel sprites defined as character maps. Each character maps
 * to a palette colour ('.' = transparent). Sprites are drawn at 4 art
 * pixels per terrain cell (scale 0.25) so small machines get readable
 * detail.
 */
export const SPRITE_SCALE = 0.25;

type Pal = Record<string, number>;

const BASE: Pal = {
  K: 0x0a0c14, // outline
  D: 0x262c3c, // dark hull
  M: 0x434d66, // mid hull
  L: 0x7684a4, // light hull
  W: 0xe2ecff, // highlight
  c: 0x116a86, // dark cyan
  C: 0x29d8f0, // cyan
  o: 0xa8401a, // dark orange
  O: 0xff8a2a, // orange
  Y: 0xffe08a, // flame core
  P: 0x9b5cff, // violet accent
};

function build(rows: string[], pal: Pal): Texture {
  const h = rows.length;
  const w = rows[0].length;
  const px = new Uint8Array(w * h * 4);
  rows.forEach((row, y) => {
    if (row.length !== w) throw new Error(`sprite row ${y} has width ${row.length}, expected ${w}`);
    for (let x = 0; x < w; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      const col = pal[ch];
      if (col === undefined) throw new Error(`unknown sprite colour '${ch}'`);
      const p = (y * w + x) * 4;
      px[p] = (col >> 16) & 255;
      px[p + 1] = (col >> 8) & 255;
      px[p + 2] = col & 255;
      px[p + 3] = 255;
    }
  });
  return new Texture({
    source: new BufferImageSource({ resource: px, width: w, height: h, scaleMode: 'nearest', autoGenerateMipmaps: false }),
  });
}

// Rig: 16×13. Eye row uses E (cyan idle / orange firing); flames F/G animate.
const RIG = [
  '.....KKKKKK.....',
  '....KWLLLLLK....',
  '...KLLMMMMMLK...',
  '..KLMMKKKKMMLK..',
  '.KLMMKcEEEcKMMK.',
  'KLMMMKEEWEEKMMMK',
  'KDMMMKcEEEcKMMDK',
  'KDDMMMKKKKKMMDDK',
  '.KDDDDDDDDDDDDK.',
  '..KPK.KDDK.KPK..',
  '..KDK..KK..KDK..',
  '..FGF......FGF..',
  '...F........F...',
];

const EMITTER = [
  '...KKKK...',
  '..KLLLLK..',
  '.KLMEEMLK.',
  'KLMEWEEMLK',
  'KDMEEEEMDK',
  '.KDMMMMDK.',
  '..KDKKDK..',
  '.KDK..KDK.',
  'KDK....KDK',
  'KK......KK',
];

function variant(rows: string[], map: Record<string, string>): string[] {
  return rows.map((r) => r.replace(/[EFG]/g, (ch) => map[ch] ?? ch));
}

export interface SpriteSet {
  rig: { idle: Texture[]; firing: Texture[] };
  emitter: { idle: Texture; active: Texture };
}

let cache: SpriteSet | null = null;

export function sprites(): SpriteSet {
  if (cache) return cache;
  const flameA = { F: 'C', G: 'Y' };
  const flameB = { F: 'c', G: 'C' };
  cache = {
    rig: {
      idle: [build(variant(RIG, { E: 'C', ...flameA }), BASE), build(variant(RIG, { E: 'C', ...flameB }), BASE)],
      firing: [build(variant(RIG, { E: 'O', ...flameA, F: 'O' }), BASE), build(variant(RIG, { E: 'O', ...flameB, F: 'o' }), BASE)],
    },
    emitter: {
      idle: build(variant(EMITTER, { E: 'c' }), BASE),
      active: build(variant(EMITTER, { E: 'C' }), BASE),
    },
  };
  return cache;
}
