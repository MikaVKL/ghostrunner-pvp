/**
 * Switching a player's combat action. Shared by the action state machine (actions.ts),
 * the guard (guard.ts), posture (posture.ts) and the combat resolution.
 */
import type { ActionState, PlayerState } from '../sim/playerState';

export function setAction(p: PlayerState, action: ActionState): void {
  p.action = action;
  p.actionTicks = 0;
  p.attackConnected = false;
}

/** Stun the player for `ticks` (cannot attack, guard or dash; moves slowly). */
export function stun(p: PlayerState, ticks: number): void {
  setAction(p, 'stunned');
  p.stunTicks = ticks;
  p.dashTicks = 0;
  p.lungeTicks = 0;
}
