/**
 * Per-player combat state machine: idle -> attack / parry -> idle, or stunned -> idle.
 *
 * This part depends only on the player's OWN state and input, so the client can predict
 * it. Everything that involves the OTHER player (hits, parries) is in resolveCombat.ts.
 */
import { Button, wasPressed, type InputCmd } from '../input';
import type { ActionState, PlayerState } from '../sim/playerState';
import { COMBAT } from './combatConfig';
import { assertNever } from '../util/assertNever';
import { attackTotalTicks, getWeapon } from './weapons';

export function setAction(p: PlayerState, action: ActionState): void {
  p.action = action;
  p.actionTicks = 0;
  p.attackConnected = false;
}

/** Advance the action state machine by one tick. */
export function stepAction(p: PlayerState, input: InputCmd): void {
  switch (p.action) {
    case 'idle':
      if (wasPressed(input, p.prevButtons, Button.Attack)) setAction(p, 'attack');
      else if (wasPressed(input, p.prevButtons, Button.Parry)) setAction(p, 'parry');
      return;
    case 'attack':
      p.actionTicks++;
      if (p.actionTicks >= attackTotalTicks(getWeapon(p.weaponId))) setAction(p, 'idle');
      return;
    case 'parry':
      p.actionTicks++;
      if (p.actionTicks >= COMBAT.parryWindowTicks + COMBAT.parryRecoveryTicks) setAction(p, 'idle');
      return;
    case 'stunned':
      p.actionTicks++;
      if (p.actionTicks >= COMBAT.parryStunTicks) setAction(p, 'idle');
      return;
    default:
      assertNever(p.action);
  }
}

/** True while the swing can hit (the "active" phase). */
export function isAttackActive(p: PlayerState): boolean {
  if (p.action !== 'attack') return false;
  const weapon = getWeapon(p.weaponId);
  return (
    p.actionTicks >= weapon.startupTicks &&
    p.actionTicks < weapon.startupTicks + weapon.activeTicks
  );
}

/** True while the parry blocks incoming attacks. */
export function isParryActive(p: PlayerState): boolean {
  return p.action === 'parry' && p.actionTicks < COMBAT.parryWindowTicks;
}

/** Run speed multiplier caused by the current action. */
export function actionSpeedFactor(p: PlayerState): number {
  if (p.action === 'stunned') return COMBAT.stunnedSpeedFactor;
  if (p.action === 'parry') return COMBAT.parrySpeedFactor;
  return 1;
}
