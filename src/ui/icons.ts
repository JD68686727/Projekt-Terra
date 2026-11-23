/**
 * Hand-drawn 12×12 pixel icons (character maps → PNG data URLs, rendered
 * once, displayed with image-rendering: pixelated). Same light direction
 * and palette family as the world art.
 */
const PAL: Record<string, string> = {
  K: '#0a0b14', // outline
  O: '#ff8a2a', o: '#a8401a', Y: '#ffe08a', // ore / orange
  C: '#29d8f0', c: '#116a86', W: '#e8f4ff', // crystal / cyan
  P: '#d070ff', p: '#6a2a90', // violet
  G: '#93a0bc', g: '#4a5470', D: '#272c3e', // steel
  M: '#3ff0d0', m: '#1b6a6a', // nano mint
  R: '#ff5a3a', r: '#8a1e14', // red
  L: '#5fbf8c', // leaf
};

const ICONS: Record<string, string[]> = {
  mp: [
    '............',
    '....KKKK....',
    '...KOYYOK...',
    '..KOOYOOOK..',
    '.KoOOOOOOOK.',
    '.KoOOOOOYOK.',
    '.KooOOOOOOK.',
    '.KoooOOOOOK.',
    '..KooooOOK..',
    '...KKoooK...',
    '.....KKK....',
    '............',
  ],
  rf: [
    '.....KK.....',
    '....KWCK....',
    '...KWCCcK...',
    '...KWCCcK...',
    '..KWCCCccK..',
    '..KWCCCccK..',
    '..KCCCCccK..',
    '..KCCCcccK..',
    '...KCCccK...',
    '...KCcccK...',
    '....KccK....',
    '.....KK.....',
  ],
  depth: [
    '....KKKK....',
    '....KGgK....',
    '....KGgK....',
    '....KGgK....',
    '....KGgK....',
    '.KKKKGgKKKK.',
    '.KGGGGggggK.',
    '..KGGGgggK..',
    '...KGGggK...',
    '....KGgK....',
    '.....KK.....',
    '............',
  ],
  broken: [
    '............',
    '..KKKK.KKK..',
    '.KGGgK.KGgK.',
    '.KGGgKKGggK.',
    'KGGGgKgGggK.',
    'KGGgKKggggK.',
    '.KGKKgKKggK.',
    '.KKggKgKgK..',
    '..KgggKggK..',
    '..KKKK.KKK..',
    '............',
    '............',
  ],
  laser: [
    '..........KK',
    '.........KYK',
    '........KOK.',
    '.......KOK..',
    'KKKK..KOK...',
    'KGGgKKOK....',
    'KGWgggK.....',
    'KGGggDK.....',
    'KggggDK.....',
    'KKKggDK.....',
    '..KDDK......',
    '..KKKK......',
  ],
  pulse: [
    '...KKKKKK...',
    '..KCc..cCK..',
    '.KC......CK.',
    'KC..KKKK..CK',
    'Kc.KWCCK..cK',
    'K..KCCCcK..K',
    'K..KCCccK..K',
    'Kc..KccK..cK',
    'KC..KKKK..CK',
    '.KC......CK.',
    '..KCc..cCK..',
    '...KKKKKK...',
  ],
  drill: [
    '.....KK.....',
    '....KWGK....',
    '....KGgK....',
    '...KGGgK....',
    '...KGgDgK...',
    '...KGGgDK...',
    '..KGgGDgDK..',
    '..KOOOOooK..',
    '..KOYOOooK..',
    '...KoooK....',
    '..KYK.KYK...',
    '...K...K....',
  ],
  nano: [
    '............',
    '..KK....KK..',
    '.KMmK..KMmK.',
    '.KmmK..KmmK.',
    '..KK.KK.KK..',
    '....KMmK....',
    '....KmmK....',
    '..KK.KK.KK..',
    '.KMmK..KMmK.',
    '.KmmK..KmmK.',
    '..KK....KK..',
    '............',
  ],
  fracture: [
    '.....KK.....',
    '...KKRrKK...',
    '..KRRRrrrK..',
    '.KRRYRRrrrK.',
    '.KRYRRRrrrK.',
    'KRRRKRRrKrrK',
    'KRRRRKRKrrrK',
    '.KRRRRKrrrK.',
    '.KrRRRKrrrK.',
    '..KrrrrrrK..',
    '...KKrrKK...',
    '.....KK.....',
  ],
  auto: [
    '.....KK.....',
    '....KCcK....',
    '..KKKCcKKK..',
    '.KC..KK..CK.',
    '.KC.KOOK.CK.',
    'KCcKKOYKKcCK',
    'KCcKKOOKKcCK',
    '.KC.KooK.CK.',
    '.KC..KK..CK.',
    '..KKKCcKKK..',
    '....KCcK....',
    '.....KK.....',
  ],
  emitter: [
    '...KKKKK....',
    '..KGGGGgK...',
    '.KGgCCgggK..',
    '.KGCWCCggK..',
    '.KgCCCcggK..',
    '..KggggDK...',
    '...KKDDK....',
    '...KDKKDK...',
    '..KDK..KDK..',
    '.KDK....KDK.',
    '.KK......KK.',
    '............',
  ],
  upgrades: [
    '.....KK.....',
    '....KOOK....',
    '...KOYOOK...',
    '..KOOOOooK..',
    '.KKKOOooKKK.',
    '...KOOooK...',
    '..KKKooKKK..',
    '.KOOKKKKOoK.',
    'KOYOOK.KOooK',
    'KOOooK..KooK',
    '.KooK....KK.',
    '..KK........',
  ],
  sound: [
    '.......KKK..',
    '......KGGK..',
    '.....KGgKK..',
    'KKKKKGgK....',
    'KGGGGgK.....',
    'KGWGggK..K..',
    'KGGggDK.KCK.',
    'KggggDK..K..',
    'KKKKKgK.....',
    '.....KgK....',
    '......KgK...',
    '.......KK...',
  ],
  lock: [
    '............',
    '....KKKK....',
    '...KGggGK...',
    '..KG.KK.gK..',
    '..Kg....gK..',
    '.KKKKKKKKKK.',
    '.KGGGGgggDK.',
    '.KGgKKKggDK.',
    '.KGgKKKggDK.',
    '.KgggKgggDK.',
    '.KDDDDDDDDK.',
    '.KKKKKKKKKK.',
  ],
  core: [
    '....KKKK....',
    '..KKpPPpKK..',
    '.KpPPWPPppK.',
    '.KPPWPPPppK.',
    'KpPPPPPPpppK',
    'KpPPPPPpppK.',
    'KpPPPPpppppK',
    '.KpPPpppppK.',
    '.KppppppppK.',
    '..KKpppKKK..',
    '....KKKK....',
    '............',
  ],
  arrow: [
    '............',
    '......KK....',
    '......KYK...',
    '......KOYK..',
    'KKKKKKKOOYK.',
    'KYYYYYYOOOOK',
    'KOOOOOOOOooK',
    'KKKKKKKOooK.',
    '......KooK..',
    '......KoK...',
    '......KK....',
    '............',
  ],
};

const cache = new Map<string, string>();

export type IconName = keyof typeof ICONS;

/** PNG data URL for an icon (12×12 art pixels). */
export function iconUrl(name: IconName): string {
  const hit = cache.get(name);
  if (hit) return hit;
  const rows = ICONS[name];
  const c = document.createElement('canvas');
  c.width = 12;
  c.height = 12;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  rows.forEach((row, y) => {
    for (let x = 0; x < 12; x++) {
      const ch = row[x] ?? '.';
      if (ch === '.' || ch === ' ') continue;
      ctx.fillStyle = PAL[ch] ?? '#ff00ff';
      ctx.fillRect(x, y, 1, 1);
    }
  });
  const url = c.toDataURL('image/png');
  cache.set(name, url);
  return url;
}

/** <img> element for an icon at an integer scale. */
export function icon(name: IconName, scale = 2, cls = 'px-icon'): HTMLImageElement {
  const img = document.createElement('img');
  img.src = iconUrl(name);
  img.width = 12 * scale;
  img.height = 12 * scale;
  img.className = cls;
  img.alt = '';
  img.draggable = false;
  return img;
}

/** All icon rows must be 12 wide × 12 tall (checked by unit test). */
export const ICON_DATA = ICONS;
