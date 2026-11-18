/**
 * Default controls. The player can change them in the menu ("Tastenbelegung", see
 * keymap.ts and ui/keymapUi.ts); the changes are saved in the browser.
 *
 * Key names are `KeyboardEvent.code` values (physical key positions, layout independent).
 * Mouse buttons are written as "Mouse0" (left), "Mouse1" (middle), "Mouse2" (right).
 */
import { Button } from '../../shared/input';

/** Everything the player can bind. Order = order in the menu. */
export const ACTIONS = ['forward', 'back', 'left', 'right', 'attack', 'parry', 'dash', 'jump', 'crouch', 'walk'] as const;
export type Action = (typeof ACTIONS)[number];

/** Each action has two slots (e.g. mouse + a key). An empty string = not bound. */
export type Keymap = Record<Action, [string, string]>;

export const DEFAULT_KEYMAP: Keymap = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  attack: ['Mouse0', 'KeyJ'],
  // Block/parry (tap = parry, hold = block). The right mouse button is kept free for the shuriken.
  parry: ['KeyQ', ''],
  dash: ['ShiftLeft', 'ShiftRight'],
  jump: ['Space', ''],
  // C, not Ctrl: Ctrl+W (with W held) closes the browser tab and a web page cannot stop that.
  crouch: ['KeyC', ''],
  walk: ['KeyV', ''],
};

/** German names in the menu. */
export const ACTION_LABELS: Record<Action, string> = {
  forward: 'Vorwärts',
  back: 'Rückwärts',
  left: 'Links',
  right: 'Rechts',
  attack: 'Schlag',
  parry: 'Block / Parry',
  dash: 'Dash',
  jump: 'Springen',
  crouch: 'Slide / Ducken',
  walk: 'Gehen (halten)',
};

/** The game button of each action (movement keys are axes, not buttons). */
export const ACTION_BUTTONS: Partial<Record<Action, number>> = {
  attack: Button.Attack,
  parry: Button.Parry,
  dash: Button.Dash,
  jump: Button.Jump,
  crouch: Button.Crouch,
  walk: Button.Walk,
};

/** Keys that are not game buttons (handled in app/gameApp.ts). They cannot be rebound. */
export const UI_KEYS = {
  rematch: 'KeyR',
  mute: 'KeyM',
  help: 'KeyH',
  /** Solo: watch the replay of the match so far (also closes the replay). */
  replay: 'KeyB',
};

/** Radians of rotation per pixel of mouse movement (at sensitivity 1.0 in the settings). */
export const MOUSE_SENSITIVITY = 0.0022;
