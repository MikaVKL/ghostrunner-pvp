/**
 * Notices the moment something STARTS by comparing a player's state before and after:
 * "was on the ground, is in the air now and moving up" = a jump.
 *
 * Why not use GameEvents? Events only exist for interactions decided by the server (hit,
 * parry, death). Jumps, dashes and swings are predicted locally, so for instant feedback
 * (sound, particles) we read them directly from the PlayerState.
 */
import { MOVE } from '../../shared/movement/movementConfig';
import type { PlayerState } from '../../shared/sim/playerState';

export type Moment =
  | 'jump'
  | 'doubleJump'
  | 'padLaunch'
  | 'wallJump'
  | 'land'
  | 'dash'
  | 'swing'
  | 'swingDash'
  | 'parry'
  | 'wallRunStart'
  | 'wallRunEnd'
  | 'stunned'
  | 'slide';

/** Leaving the ground faster than any jump can only be a jump pad. */
const PAD_LAUNCH_SPEED = MOVE.jumpSpeed + 0.5;

export function detectMoments(before: PlayerState, after: PlayerState): Moment[] {
  if (!before.alive || !after.alive) return [];
  const moments: Moment[] = [];
  if (before.wallRunning && !after.wallRunning && after.vel.y > 5) moments.push('wallJump');
  else if (before.grounded && !after.grounded && after.vel.y > PAD_LAUNCH_SPEED) moments.push('padLaunch');
  else if (before.grounded && !after.grounded && after.vel.y > 4) moments.push('jump');
  else if (!before.grounded && after.airJumpsLeft < before.airJumpsLeft) moments.push('doubleJump');
  if (!before.grounded && after.grounded && before.vel.y < -4) moments.push('land');
  if (before.dashTicks === 0 && after.dashTicks > 0) moments.push('dash');
  if (before.slideTicks === 0 && after.slideTicks > 0) moments.push('slide');
  if (!before.wallRunning && after.wallRunning) moments.push('wallRunStart');
  if (before.wallRunning && !after.wallRunning) moments.push('wallRunEnd');
  if (before.action !== after.action) {
    if (after.action === 'attack') moments.push(after.attackKind === 'dash' ? 'swingDash' : 'swing');
    if (after.action === 'parry') moments.push('parry');
    if (after.action === 'stunned') moments.push('stunned');
  }
  return moments;
}
