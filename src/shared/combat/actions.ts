/**
 * Per-player combat state machine: idle -> attack / guard -> idle, or stunned -> idle.
 * Guard = parry window + block (guard.ts); posture drains here (posture.ts).
 *
 * This part depends only on the player's OWN state and input, so the client can predict
 * it. Everything that involves the OTHER player (hits, parries) is in resolveCombat.ts.
 */
import type { InputCmd } from '../input';
import type { GameMode } from '../match/gameModes';
import type { MovementResult } from '../movement/stepMovement';
import { MOVE } from '../movement/movementConfig';
import type { PlayerState } from '../sim/playerState';
import { assertNever } from '../util/assertNever';
import { setAction } from './actionState';
import { COMBAT } from './combatConfig';
import { isBlocking, isParryActive, stepGuard, tryStartGuard } from './guard';
import { drainPosture } from './posture';
import { attackTotalTicks, getWeapon, type AttackProfile } from './weapons';

export { isBlocking, isParryActive, setAction };

/** The attack profile (light or dash) of the swing the player is doing / did last. */
export function currentAttack(p: PlayerState): AttackProfile {
  return getWeapon(p.weaponId).attacks[p.attackKind];
}

/** Whole length of the current swing in this mode (a dash attack may recover longer). */
export function swingTotalTicks(p: PlayerState, mode: GameMode): number {
  if (p.attackKind !== 'dash') return attackTotalTicks(currentAttack(p));
  // A dash attack that hit nothing (no contact, decided by the server) recovers longer.
  const missed = p.attackConnected ? 0 : COMBAT.dashAttackMissRecoveryTicks;
  return attackTotalTicks(currentAttack(p)) + mode.dashAttackExtraRecoveryTicks + missed;
}

/** True while dashing or shortly after: an attack started now becomes a dash attack. */
export function isDashAttackReady(p: PlayerState, mode: GameMode): boolean {
  if (p.dashTicks > 0) return true;
  const ticksSinceDashStart = mode.dashCooldownTicks - p.dashCooldown;
  return p.dashCooldown > 0 && ticksSinceDashStart <= MOVE.dashTicks + COMBAT.dashAttackGraceTicks;
}

/** Start a swing or a guard if one was pressed recently (input buffer, see sim/inputBuffer.ts). */
function stepIdle(p: PlayerState, mode: GameMode, input: InputCmd): void {
  if (p.bufferAttack > 0 && p.attackCooldown === 0) {
    p.bufferAttack = 0;
    setAction(p, 'attack');
    p.attackKind = isDashAttackReady(p, mode) ? 'dash' : p.grounded ? 'light' : 'air';
    p.lungeTicks = currentAttack(p).lungeTicks;
    if (p.attackKind === 'air') p.vel.y = Math.max(p.vel.y, COMBAT.airAttackHop);
  } else {
    tryStartGuard(p, input);
  }
}

/**
 * A dash or jump ends the recovery of a normal swing at once (flow: strike, dash on).
 * Not for the dash attack: its long recovery is the price for its reach.
 */
export function canCancelRecovery(p: PlayerState): boolean {
  if (p.action !== 'attack' || p.attackKind === 'dash') return false;
  const attack = currentAttack(p);
  return p.actionTicks >= attack.startupTicks + attack.activeTicks;
}

/**
 * Advance the action state machine by one tick.
 * @param moved what the movement did this tick (a dash or jump may cancel a recovery)
 */
export function stepAction(
  p: PlayerState,
  mode: GameMode,
  input: InputCmd,
  moved: MovementResult = { jumped: false, dashed: false },
): void {
  drainPosture(p);
  if (p.attackCooldown > 0) p.attackCooldown--;
  if (p.parryCooldown > 0) p.parryCooldown--;
  if (p.invulnerableTicks > 0) p.invulnerableTicks--;
  if (p.counterTicks > 0) p.counterTicks--;

  switch (p.action) {
    case 'idle':
      stepIdle(p, mode, input);
      return;
    case 'attack':
      if ((moved.dashed || moved.jumped) && canCancelRecovery(p)) {
        setAction(p, 'idle');
        p.attackCooldown = getWeapon(p.weaponId).cooldownTicks;
        return;
      }
      p.actionTicks++;
      if (p.actionTicks >= swingTotalTicks(p, mode)) {
        setAction(p, 'idle');
        p.attackCooldown = getWeapon(p.weaponId).cooldownTicks;
      }
      return;
    case 'guard':
      stepGuard(p, input);
      return;
    case 'stunned':
      p.actionTicks++;
      if (p.actionTicks >= p.stunTicks) setAction(p, 'idle');
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

/** Run speed multiplier caused by the current action (blocking caps the speed instead, see stepPlayer). */
export function actionSpeedFactor(p: PlayerState): number {
  return p.action === 'stunned' ? COMBAT.stunnedSpeedFactor : 1;
}
