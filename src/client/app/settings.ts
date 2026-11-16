/**
 * Player settings (sound volume, mouse sensitivity). Saved in the browser's localStorage,
 * so they survive a reload.
 */
const STORAGE_KEY = 'settings';

export interface Settings {
  /** 0..1 */
  volume: number;
  /** Multiplier on the mouse speed, 0.2..3. */
  sensitivity: number;
}

const DEFAULTS: Settings = { volume: 0.6, sensitivity: 1 };

export function loadSettings(): Settings {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Settings>;
    return {
      volume: typeof stored.volume === 'number' ? stored.volume : DEFAULTS.volume,
      sensitivity: typeof stored.sensitivity === 'number' ? stored.sensitivity : DEFAULTS.sensitivity,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
