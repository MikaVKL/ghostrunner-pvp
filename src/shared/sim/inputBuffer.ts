/**
 * Input buffer: a button pressed a moment too early still counts. Each press of attack,
 * parry, dash or jump starts a short timer in PlayerState (INPUT_BUFFER_TICKS); the action
 * happens on the first tick it is allowed while the timer runs, and then uses it up.
 * Still "edge triggered" (golden rule 7): only a NEW press fills the buffer, holding a
 * button does not repeat the action.
 */
import { INPUT_BUFFER_TICKS } from '../config';
import { Button, wasPressed, type InputCmd } from '../input';
import type { PlayerState } from './playerState';

type BufferField = 'bufferAttack' | 'bufferParry' | 'bufferDash' | 'bufferJump';

const FIELDS: [BufferField, number][] = [
  ['bufferAttack', Button.Attack],
  ['bufferParry', Button.Parry],
  ['bufferDash', Button.Dash],
  ['bufferJump', Button.Jump],
];

/** Call once per tick BEFORE the player moves/acts: new presses fill, old ones run out. */
export function updateInputBuffer(p: PlayerState, input: InputCmd): void {
  for (const [field, button] of FIELDS) {
    if (wasPressed(input, p.prevButtons, button)) p[field] = INPUT_BUFFER_TICKS;
    else if (p[field] > 0) p[field]--;
  }
}

/** Forget all buffered presses (frozen players, e.g. during the countdown). */
export function clearInputBuffer(p: PlayerState): void {
  for (const [field] of FIELDS) p[field] = 0;
}
