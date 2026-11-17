/**
 * Player settings (sound volume, mouse sensitivity, killcam, wind-up cue, look-and-feel
 * effects). Saved in the browser's localStorage, so they survive a reload.
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

/** Look-and-feel effects. Each one can be switched off in the menu. Display only. */
export interface FxSettings {
  /** Bright things (blades, neon edges) glow. Costs some graphics power. */
  bloom: boolean;
  /** Streaks at the edge of the screen when moving fast. */
  speedLines: boolean;
  /** A ribbon of light behind the blade during a swing. */
  swordTrail: boolean;
  /** The picture freezes for a few hundredths of a second when blades connect. */
  hitstop: boolean;
  /** Spark + sound the moment your swing reaches the enemy (before the server decides). */
  hitSpark: boolean;
  /** Clearer wind-up: bigger pose, glowing blade and a "draw" sound. */
  telegraph: boolean;
}

export const FX_KEYS: readonly (keyof FxSettings)[] = ['bloom', 'speedLines', 'swordTrail', 'hitstop', 'hitSpark', 'telegraph'];

export interface Settings extends FxSettings {
  /** 0..1 */
  volume: number;
  /** Multiplier on the mouse speed, 0.2..3. */
  sensitivity: number;
  /** Show the killcam after a sword kill in solo mode. */
  killcam: boolean;
  /** Red ring + short tone while the enemy's swing winds up. */
  windupCue: WindupCueSetting;
}

export const DEFAULT_SETTINGS: Settings = {
  volume: 0.6,
  sensitivity: 1,
  killcam: true,
  windupCue: 'auto',
  bloom: true,
  speedLines: true,
  swordTrail: true,
  hitstop: true,
  hitSpark: true,
  telegraph: true,
};

/** Read stored settings. Unknown or broken values fall back to the defaults. */
export function parseSettings(raw: unknown): Settings {
  const stored = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const num = (key: 'volume' | 'sensitivity') => (typeof stored[key] === 'number' ? (stored[key] as number) : DEFAULT_SETTINGS[key]);
  const bool = (key: keyof FxSettings | 'killcam') =>
    typeof stored[key] === 'boolean' ? (stored[key] as boolean) : DEFAULT_SETTINGS[key];
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    volume: num('volume'),
    sensitivity: num('sensitivity'),
    killcam: bool('killcam'),
    windupCue: isWindupCueSetting(stored.windupCue) ? stored.windupCue : DEFAULT_SETTINGS.windupCue,
  };
  for (const key of FX_KEYS) settings[key] = bool(key);
  return settings;
}

export function loadSettings(): Settings {
  try {
    return parseSettings(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
