/**
 * Player settings (sound volume, mouse sensitivity, killcam, wind-up cue). Saved in the
 * browser's localStorage, so they survive a reload.
 */
import type { GameMode } from '../../shared/match/gameModes';

const STORAGE_KEY = 'settings';

/** Wind-up cue: 'auto' = as the game mode suggests (duel: off), or always on / always off. */
export type WindupCueSetting = 'auto' | 'on' | 'off';
const WINDUP_CUE_SETTINGS: readonly string[] = ['auto', 'on', 'off'];

export function isWindupCueSetting(value: unknown): value is WindupCueSetting {
  return typeof value === 'string' && WINDUP_CUE_SETTINGS.includes(value);
}

/** Is the wind-up cue shown in a match of this mode? */
export function windupCueEnabled(setting: WindupCueSetting, mode: GameMode | null): boolean {
  if (setting === 'auto') return mode?.windupCueByDefault ?? false;
  return setting === 'on';
}

export interface Settings {
  /** 0..1 */
  volume: number;
  /** Multiplier on the mouse speed, 0.2..3. */
  sensitivity: number;
  /** Show the killcam after a sword kill in solo mode. */
  killcam: boolean;
  /** Red ring + short tone while the enemy's swing winds up. */
  windupCue: WindupCueSetting;
}

const DEFAULTS: Settings = { volume: 0.6, sensitivity: 1, killcam: true, windupCue: 'auto' };

export function loadSettings(): Settings {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Settings>;
    return {
      volume: typeof stored.volume === 'number' ? stored.volume : DEFAULTS.volume,
      sensitivity: typeof stored.sensitivity === 'number' ? stored.sensitivity : DEFAULTS.sensitivity,
      killcam: typeof stored.killcam === 'boolean' ? stored.killcam : DEFAULTS.killcam,
      windupCue: isWindupCueSetting(stored.windupCue) ? stored.windupCue : DEFAULTS.windupCue,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
