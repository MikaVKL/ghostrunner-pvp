/**
 * Basic locomotion: running, air control, jumping and gravity.
 */
import { TICK_DT } from '../config';
import type { InputCmd } from '../input';
import { moveToward } from '../math/scalar';
import { forwardFromYaw, rightFromYaw } from '../math/vec3';
import type { PlayerState } from '../sim/playerState';
import { MOVE } from './movementConfig';

/** Unit direction the player wants to move in (world space), or 0/0 if no keys are held. */
export function wishDirection(input: InputCmd): { x: number; z: number } {
  if (input.moveX === 0 && input.moveZ === 0) return { x: 0, z: 0 };
  const forward = forwardFromYaw(input.yaw);
  const right = rightFromYaw(input.yaw);
  const x = forward.x * input.moveZ + right.x * input.moveX;
  const z = forward.z * input.moveZ + right.z * input.moveX;
  const length = Math.hypot(x, z);
  return { x: x / length, z: z / length };
}

/**
 * Air control for one axis: speed up or turn toward `target`, but never take away speed
 * the player already has in that direction. Flying faster than run speed (jump pad,
 * dash, wall-jump) and holding "forward" must not slow you down.
 */
function steerInAir(current: number, target: number, maxDelta: number): number {
  const fasterThanWished = current * target > 0 && Math.abs(current) >= Math.abs(target);
  return fasterThanWished ? current : moveToward(current, target, maxDelta);
}

/**
 * Momentum on the ground: if the player is faster than `topSpeed` and still moving roughly
 * the wished way, return the speed to keep this tick (a little less than now). Otherwise 0
 * (= normal running). Turning is still possible, the speed then follows the new direction.
 */
function keptMomentum(p: PlayerState, wish: { x: number; z: number }, topSpeed: number): number {
  const speed = Math.hypot(p.vel.x, p.vel.z);
  if (speed <= topSpeed) return 0;
  const alignment = (p.vel.x * wish.x + p.vel.z * wish.z) / speed;
  if (alignment < MOVE.momentumMinAlign) return 0;
  return Math.max(topSpeed, speed - MOVE.overspeedDecay * TICK_DT);
}

/**
 * Accelerate horizontally toward the wished direction, handle jump and gravity.
 * Returns true if the player jumped.
 * @param topSpeed the speed to run at: sprint, walk or crouch (see stepMovement.ts)
 */
export function stepLocomotion(
  p: PlayerState,
  wish: { x: number; z: number },
  jumpPressed: boolean,
  topSpeed: number,
): boolean {
  const hasInput = wish.x !== 0 || wish.z !== 0;
  const targetX = wish.x * topSpeed;
  const targetZ = wish.z * topSpeed;

  if (p.grounded) {
    const accel = (hasInput ? MOVE.groundAccel : MOVE.groundFriction) * TICK_DT;
    const kept = hasInput ? keptMomentum(p, wish, topSpeed) : 0;
    p.vel.x = moveToward(p.vel.x, kept > 0 ? wish.x * kept : targetX, accel);
    p.vel.z = moveToward(p.vel.z, kept > 0 ? wish.z * kept : targetZ, accel);
  } else if (hasInput) {
    // In the air we only steer when keys are held, so momentum is kept otherwise.
    const accel = MOVE.airAccel * TICK_DT;
    p.vel.x = steerInAir(p.vel.x, targetX, accel);
    p.vel.z = steerInAir(p.vel.z, targetZ, accel);
  }

  let jumped = false;
  if (jumpPressed && (p.grounded || p.coyoteTicks > 0)) {
    jumped = true;
    p.vel.y = MOVE.jumpSpeed;
    p.grounded = false;
    p.coyoteTicks = 0;
  } else if (jumpPressed && p.airJumpsLeft > 0) {
    jumped = true;
    // Double jump: a second jump in mid-air.
    p.vel.y = MOVE.airJumpSpeed;
    p.airJumpsLeft--;
  }

  p.vel.y = Math.max(p.vel.y - MOVE.gravity * TICK_DT, -MOVE.terminalFallSpeed);
  return jumped;
}
