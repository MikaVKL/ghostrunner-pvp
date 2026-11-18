/**
 * Posture ("Haltung", like Sekiro): blocking is safe but fills your own posture bar; a
 * parry fills the ATTACKER's bar a lot. A full bar breaks the posture: stunned for
 * COMBAT.postureBreakTicks, then the bar starts empty again. Without pressure the bar
 * slowly drains (after COMBAT.postureRegenDelayTicks).
 *
 * Filling happens in resolveCombat (server only, it needs both players); draining is
 * predictable and runs in stepAction (client and server).
 */
import { TICK_DT } from '../config';
import type { PlayerState } from '../sim/playerState';
import { stun } from './actionState';
import { COMBAT } from './combatConfig';

/** Add posture damage. Returns true if this broke the posture (the player is now stunned). */
export function addPosture(p: PlayerState, amount: number): boolean {
  p.posture += amount;
  p.postureRegenDelay = COMBAT.postureRegenDelayTicks;
  if (p.posture < COMBAT.postureMax) return false;
  p.posture = 0;
  stun(p, COMBAT.postureBreakTicks);
  return true;
}

/** Slowly drain the bar once there was no pressure for a while. Call once per tick. */
export function drainPosture(p: PlayerState): void {
  if (p.postureRegenDelay > 0) {
    p.postureRegenDelay--;
    return;
  }
  if (p.posture > 0) p.posture = Math.max(0, p.posture - COMBAT.postureRegenPerSecond * TICK_DT);
}

/** 0..1 for the HUD. */
export function postureFraction(p: PlayerState): number {
  return Math.min(1, p.posture / COMBAT.postureMax);
}
