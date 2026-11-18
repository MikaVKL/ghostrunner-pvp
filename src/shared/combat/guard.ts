/**
 * Guard (key Q, Button.Parry): one action for parry AND block.
 *
 *   press Q          -> guard starts. If the parry window is ready, the first
 *                       COMBAT.parryWindowTicks are a PARRY (deflects, fills the attacker's
 *                       posture). The next window is ready COMBAT.parryCooldownTicks after
 *                       this one started - so mashing Q gives blocks, not parries.
 *   keep holding Q   -> after the window: BLOCK. Safe, but fills your own posture; you move
 *                       only at walk speed and cannot sprint, dash or swing.
 *   release Q        -> guard ends (a short tap still gets its full parry window).
 *
 * Holding Q while another action ends starts a block right away (no parry window).
 * All of this depends only on the player's own state and input: the client predicts it.
 */
import { Button, isDown, type InputCmd } from '../input';
import type { PlayerState } from '../sim/playerState';
import { setAction } from './actionState';
import { COMBAT } from './combatConfig';

/** Start guarding: on a fresh press (input buffer) or while Q is still held. Returns true if started. */
export function tryStartGuard(p: PlayerState, input: InputCmd): boolean {
  const pressed = p.bufferParry > 0;
  if (!pressed && !isDown(input, Button.Parry)) return false;
  p.bufferParry = 0;
  setAction(p, 'guard');
  // Only a new press can parry, and only if the window is ready again.
  p.guardParry = pressed && p.parryCooldown === 0;
  if (p.guardParry) p.parryCooldown = COMBAT.parryCooldownTicks;
  return true;
}

/** One tick of guarding: ends when Q is released (but never cuts the parry window short). */
export function stepGuard(p: PlayerState, input: InputCmd): void {
  p.actionTicks++;
  if (isDown(input, Button.Parry) || isParryActive(p)) return;
  setAction(p, 'idle');
}

/** True while the parry window is open. */
export function isParryActive(p: PlayerState): boolean {
  return p.action === 'guard' && p.guardParry && p.actionTicks < COMBAT.parryWindowTicks;
}

/** True while blocking (guarding, but outside the parry window). */
export function isBlocking(p: PlayerState): boolean {
  return p.action === 'guard' && !isParryActive(p);
}
