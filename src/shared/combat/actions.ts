/**
 * Per-player combat state machine: idle -> attack / parry -> idle, or stunned -> idle.
 *
 * This part depends only on the player's OWN state and input, so the client can predict
 * it. Everything that involves the OTHER player (hits, parries) is in resolveCombat.ts.
 */
import { Button, wasPressed, type InputCmd } from '../input';
import type { GameMode } from '../match/gameModes';
import { MOVE } from '../movement/movementConfig';
import type { ActionState, PlayerState } from '../sim/playerState';
import { assertNever } from '../util/assertNever';
import { COMBAT } from './combatConfig';
import { attackTotalTicks, getWeapon, type AttackProfile } from './weapons';

export function setAction(p: PlayerState, action: ActionState): void {
  p.action = action;
  p.actionTicks = 0;
  p.attackConnected = false;
}

/** The attack profile (light or dash) of the swing the player is doing / did last. */
export function currentAttack(p: PlayerState): AttackProfile {
  return getWeapon(p.weaponId).attacks[p.attackKind];
}

/** Whole length of the current swing in this mode (a dash attack may recover longer). */
export function swingTotalTicks(p: PlayerState, mode: GameMode): number {
  const extra = p.attackKind === 'dash' ? mode.dashAttackExtraRecoveryTicks : 0;
  return attackTotalTicks(currentAttack(p)) + extra;
}

/** True while dashing or shortly after: an attack started now becomes a dash attack. */
export function isDashAttackReady(p: PlayerState, mode: GameMode): boolean {
  if (p.dashTicks > 0) return true;
  const ticksSinceDashStart = mode.dashCooldownTicks - p.dashCooldown;
  return p.dashCooldown > 0 && ticksSinceDashStart <= MOVE.dashTicks + COMBAT.dashAttackGraceTicks;
}

function stepIdle(p: PlayerState, input: InputCmd, mode: GameMode): void {
  if (wasPressed(input, p.prevButtons, Button.Attack) && p.attackCooldown === 0) {
    setAction(p, 'attack');
    p.attackKind = isDashAttackReady(p, mode) ? 'dash' : 'light';
  } else if (wasPressed(input, p.prevButtons, Button.Parry) && p.parryCooldown === 0) {
    setAction(p, 'parry');
  }
}

/** Advance the action state machine by one tick. */
export function stepAction(p: PlayerState, input: InputCmd, mode: GameMode): void {
  if (p.attackCooldown > 0) p.attackCooldown--;
  if (p.parryCooldown > 0) p.parryCooldown--;
  if (p.invulnerableTicks > 0) p.invulnerableTicks--;
  if (p.counterTicks > 0) p.counterTicks--;

  switch (p.action) {
    case 'idle':
      stepIdle(p, input, mode);
      return;
    case 'attack':
      p.actionTicks++;
      if (p.actionTicks >= swingTotalTicks(p, mode)) {
        setAction(p, 'idle');
        p.attackCooldown = getWeapon(p.weaponId).cooldownTicks;
      }
      return;
    case 'parry':
      p.actionTicks++;
      if (p.actionTicks >= COMBAT.parryWindowTicks + COMBAT.parryRecoveryTicks) {
        setAction(p, 'idle');
        p.parryCooldown = COMBAT.parryCooldownTicks;
      }
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
  const attack = currentAttack(p);
  return p.actionTicks >= attack.startupTicks && p.actionTicks < attack.startupTicks + attack.activeTicks;
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
