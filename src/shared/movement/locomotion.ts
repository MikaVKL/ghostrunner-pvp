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
    p.vel.x = moveToward(p.vel.x, targetX, accel);
    p.vel.z = moveToward(p.vel.z, targetZ, accel);
  }

  if (jumpPressed && (p.grounded || p.coyoteTicks > 0)) {
    p.vel.y = MOVE.jumpSpeed;
    p.grounded = false;
    p.coyoteTicks = 0;
  }

  p.vel.y = Math.max(p.vel.y - MOVE.gravity * TICK_DT, -MOVE.terminalFallSpeed);
}
