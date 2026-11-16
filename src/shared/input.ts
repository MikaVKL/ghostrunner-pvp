/**
 * Player input: the ONLY thing a client is allowed to tell the server about its player.
 * The client never sends positions. The server simulates the player from these commands.
 */
import { clamp, wrapAngle } from './math/scalar';

/** Buttons are packed into one number as bit flags. Add new buttons with the next power of 2. */
export const Button = {
  Jump: 1,
  Dash: 2,
  Attack: 4,
  Parry: 8,
} as const;

/** All valid button bits OR-ed together. Update when adding a button. */
export const ALL_BUTTONS = Button.Jump | Button.Dash | Button.Attack | Button.Parry;

/** Maximum up/down look angle in radians (just below 90 degrees). */
export const MAX_PITCH = 1.55;

/** One input command = what the player pressed during exactly one tick. */
export interface InputCmd {
  /** Sequence number, increases by exactly 1 per tick. Starts at 1 for every room. */
  seq: number;
  /** Strafe: -1 left, 0 none, 1 right. */
  moveX: number;
  /** Walk: -1 backward, 0 none, 1 forward. */
  moveZ: number;
  /** Look direction left/right in radians. */
  yaw: number;
  /** Look direction up/down in radians. */
  pitch: number;
  /** Bit flags from `Button`. */
  buttons: number;
  /**
   * Lag compensation: the server tick at which this client was DISPLAYING the other
   * players when it made this input (they are shown slightly in the past). 0 = unknown.
   * Only combat resolution on the server uses it - it never affects the own movement.
   */
  viewTick: number;
}

/** What the keyboard/bot produces each tick (GameClient adds `seq` and `viewTick`). */
export type InputSample = Omit<InputCmd, 'seq' | 'viewTick'>;

export function neutralInput(yaw = 0, pitch = 0): InputCmd {
  return { seq: 0, moveX: 0, moveZ: 0, yaw, pitch, buttons: 0, viewTick: 0 };
}

export function isDown(input: InputCmd, button: number): boolean {
  return (input.buttons & button) !== 0;
}

/** True only on the tick where the button goes from "up" to "down". */
export function wasPressed(input: InputCmd, prevButtons: number, button: number): boolean {
  return (input.buttons & button) !== 0 && (prevButtons & button) === 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Validate and normalize an input command. Returns null if it is malformed.
 * The server calls this on everything a client sends (never trust the client).
 * The client calls it too before predicting, so both sides simulate the exact same values.
 */
export function sanitizeInput(raw: unknown): InputCmd | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!isFiniteNumber(r.seq) || !isFiniteNumber(r.moveX) || !isFiniteNumber(r.moveZ)) return null;
  if (!isFiniteNumber(r.yaw) || !isFiniteNumber(r.pitch) || !isFiniteNumber(r.buttons)) return null;
  if (!Number.isInteger(r.seq) || r.seq < 1 || r.seq > 2 ** 31) return null;
  if (r.viewTick !== undefined && !isFiniteNumber(r.viewTick)) return null;
  return {
    seq: r.seq,
    moveX: clamp(Math.round(r.moveX), -1, 1),
    moveZ: clamp(Math.round(r.moveZ), -1, 1),
    yaw: wrapAngle(r.yaw),
    pitch: clamp(r.pitch, -MAX_PITCH, MAX_PITCH),
    buttons: Math.trunc(r.buttons) & ALL_BUTTONS,
    viewTick: clamp(r.viewTick ?? 0, 0, 2 ** 31),
  };
}
