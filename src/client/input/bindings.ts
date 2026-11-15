/**
 * Which keys and mouse buttons do what. Change the lists here to rebind controls.
 * Key names are `KeyboardEvent.code` values (physical key positions, layout independent).
 */
import { Button } from '../../shared/input';

export const MOVE_KEYS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
};

/** Keyboard key -> game button. */
export const BUTTON_KEYS: Record<string, number> = {
  Space: Button.Jump,
  ShiftLeft: Button.Dash,
  ShiftRight: Button.Dash,
  KeyJ: Button.Attack,
  KeyK: Button.Parry,
  KeyF: Button.Parry,
};

/** Mouse button index (0 = left, 2 = right) -> game button. */
export const MOUSE_BUTTONS: Record<number, number> = {
  0: Button.Attack,
  2: Button.Parry,
};

/** Radians of rotation per pixel of mouse movement. */
export const MOUSE_SENSITIVITY = 0.0022;
