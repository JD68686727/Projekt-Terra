export type Quality = 'low' | 'medium' | 'high';

export interface Settings {
  volume: number; // 0..1
  muted: boolean;
  quality: Quality;
}

const KEY = 'projekt-terra.settings';
const DEFAULTS: Settings = { volume: 0.5, muted: false, quality: 'medium' };

export const QUALITY_PRESETS: Record<Quality, { particles: number; dprCap: number; label: string }> = {
  low: { particles: 300, dprCap: 1, label: 'NIEDRIG' },
  medium: { particles: 900, dprCap: 1.5, label: 'MITTEL' },
  high: { particles: 1600, dprCap: 2, label: 'HOCH' },
};

/** localStorage can throw (sandboxed iframes, privacy modes) — always guarded. */
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const s = JSON.parse(raw) as Partial<Settings>;
    return {
      volume: typeof s.volume === 'number' && s.volume >= 0 && s.volume <= 1 ? s.volume : DEFAULTS.volume,
      muted: typeof s.muted === 'boolean' ? s.muted : DEFAULTS.muted,
      quality: s.quality && s.quality in QUALITY_PRESETS ? s.quality : DEFAULTS.quality,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: settings last for this session only */
  }
}
