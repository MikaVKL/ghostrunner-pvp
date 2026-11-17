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

/** Accelerate horizontally toward the wished direction, handle jump and gravity. */
export function stepLocomotion(
  p: PlayerState,
  wish: { x: number; z: number },
  jumpPressed: boolean,
  speedFactor: number,
): void {
  const hasInput = wish.x !== 0 || wish.z !== 0;
  const targetX = wish.x * MOVE.runSpeed * speedFactor;
  const targetZ = wish.z * MOVE.runSpeed * speedFactor;

  if (p.grounded) {
    const accel = (hasInput ? MOVE.groundAccel : MOVE.groundFriction) * TICK_DT;
    p.vel.x = moveToward(p.vel.x, targetX, accel);
    p.vel.z = moveToward(p.vel.z, targetZ, accel);
  } else if (hasInput) {
    // In the air we only steer when keys are held, so momentum is kept otherwise.
    const accel = MOVE.airAccel * TICK_DT;
    p.vel.x = steerInAir(p.vel.x, targetX, accel);
    p.vel.z = steerInAir(p.vel.z, targetZ, accel);
  }

  if (jumpPressed && (p.grounded || p.coyoteTicks > 0)) {
    p.vel.y = MOVE.jumpSpeed;
    p.grounded = false;
    p.coyoteTicks = 0;
  } else if (jumpPressed && p.airJumpsLeft > 0) {
    // Double jump: a second jump in mid-air.
    p.vel.y = MOVE.airJumpSpeed;
    p.airJumpsLeft--;
  }

  p.vel.y = Math.max(p.vel.y - MOVE.gravity * TICK_DT, -MOVE.terminalFallSpeed);
}
