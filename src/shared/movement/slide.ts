/**
 * Slide and crouch (Ctrl).
 *
 *   slide  - press Ctrl while sprinting on the ground: you shoot forward low and fast and
 *            lose speed only slowly. Jumping out of a slide keeps the speed (slide-jump).
 *            Ends on release, on a jump, when leaving the ground or when too slow.
 *   crouch - hold Ctrl otherwise: low and slow. You stay low while there is no room to
 *            stand up (e.g. under a low ceiling).
 *
 * Depends only on the player's own state, input and the map, so the client predicts it.
 */
import { TICK_DT } from '../config';
import type { MapDef } from '../maps/mapTypes';
import { fitsAt, PLAYER_HEIGHT } from '../physics/collision';
import type { PlayerState } from '../sim/playerState';
import { MOVE } from './movementConfig';

/** Start a slide if Ctrl was just pressed while running fast enough on the ground. */
export function tryStartSlide(p: PlayerState, crouchPressed: boolean): void {
  if (!crouchPressed || !p.grounded || p.slideTicks > 0 || p.slideCooldown > 0) return;
  const speed = Math.hypot(p.vel.x, p.vel.z);
  if (speed < MOVE.slideMinSpeed) return;
  const boosted = Math.max(speed, MOVE.slideSpeed);
  p.vel.x = (p.vel.x / speed) * boosted;
  p.vel.z = (p.vel.z / speed) * boosted;
  p.slideTicks = MOVE.slideTicks;
  p.crouching = true;
}

export function endSlide(p: PlayerState): void {
  if (p.slideTicks === 0) return;
  p.slideTicks = 0;
  p.slideCooldown = MOVE.slideCooldownTicks;
}

/** Velocity for one tick of sliding. Call only if p.slideTicks > 0. Returns true on a slide-jump. */
export function stepSlide(p: PlayerState, jumpPressed: boolean, crouchHeld: boolean): boolean {
  p.slideTicks--;
  const speed = Math.hypot(p.vel.x, p.vel.z);
  const slower = Math.max(0, speed - MOVE.slideFriction * TICK_DT);
  if (speed > 0) {
    p.vel.x = (p.vel.x / speed) * slower;
    p.vel.z = (p.vel.z / speed) * slower;
  }
  if (jumpPressed) {
    p.vel.y = MOVE.jumpSpeed; // slide-jump: the horizontal speed is kept
    p.grounded = false;
    p.coyoteTicks = 0;
    endSlide(p);
  } else if (!crouchHeld || p.slideTicks === 0 || slower < MOVE.crouchSpeed) {
    endSlide(p);
  }
  p.vel.y = Math.max(p.vel.y - MOVE.gravity * TICK_DT, -MOVE.terminalFallSpeed);
  return jumpPressed;
}

/**
 * After moving: decide whether the body is low. Sliding or holding Ctrl on the ground =
 * low; otherwise stand up, but only if there is room above.
 */
export function updateCrouch(p: PlayerState, crouchHeld: boolean, map: MapDef): void {
  if (p.slideTicks > 0 && !p.grounded) endSlide(p); // slid off a ledge: fly on standing
  const wantsLow = p.slideTicks > 0 || (crouchHeld && p.grounded);
  if (wantsLow) p.crouching = true;
  else if (p.crouching && fitsAt(p.pos, map.boxes, PLAYER_HEIGHT)) p.crouching = false;
}
