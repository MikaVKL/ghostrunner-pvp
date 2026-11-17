/**
 * Dash: a short burst of fast, straight, gravity-free movement with a cooldown.
 */
import type { InputCmd } from '../input';
import { forwardFromYaw } from '../math/vec3';
import type { PlayerState } from '../sim/playerState';
import { MOVE } from './movementConfig';
import { endWallRun } from './wallRun';

/** Start a dash if it was pressed recently (input buffer) and the cooldown is over. Returns true if it started. */
export function tryStartDash(
  p: PlayerState,
  input: InputCmd,
  wish: { x: number; z: number },
  rules: { canDash: boolean; dashCooldownTicks: number },
): boolean {
  if (!rules.canDash || p.dashTicks > 0 || p.dashCooldown > 0) return false;
  if (p.bufferDash === 0) return false;
  p.bufferDash = 0;

  // Dash in the movement direction; if no direction is held, dash forward.
  const dir = wish.x !== 0 || wish.z !== 0 ? wish : forwardFromYaw(input.yaw);
  p.dashDirX = dir.x;
  p.dashDirZ = dir.z;
  p.dashTicks = MOVE.dashTicks;
  p.dashCooldown = rules.dashCooldownTicks;
  if (p.wallRunning) endWallRun(p);
  return true;
}

/** Set the velocity for one tick of dashing. Call only if p.dashTicks > 0. */
export function stepDash(p: PlayerState): void {
  p.dashTicks--;
  const speed = p.dashTicks > 0 ? MOVE.dashSpeed : MOVE.dashExitSpeed;
  p.vel.x = p.dashDirX * speed;
  p.vel.z = p.dashDirZ * speed;
  p.vel.y = 0;
}
