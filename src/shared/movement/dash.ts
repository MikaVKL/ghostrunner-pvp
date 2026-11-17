/**
 * Dash: a short burst of fast, straight, gravity-free movement with a cooldown.
 */
import { Button, wasPressed, type InputCmd } from '../input';
import { forwardFromYaw } from '../math/vec3';
import type { PlayerState } from '../sim/playerState';
import { MOVE } from './movementConfig';
import { endWallRun } from './wallRun';

/** Start a dash if the button was just pressed and the cooldown is over. */
export function tryStartDash(
  p: PlayerState,
  input: InputCmd,
  wish: { x: number; z: number },
  rules: { canDash: boolean; dashCooldownTicks: number },
): void {
  if (!rules.canDash || p.dashTicks > 0 || p.dashCooldown > 0) return;
  if (!wasPressed(input, p.prevButtons, Button.Dash)) return;

  // Dash in the movement direction; if no direction is held, dash forward.
  const dir = wish.x !== 0 || wish.z !== 0 ? wish : forwardFromYaw(input.yaw);
  p.dashDirX = dir.x;
  p.dashDirZ = dir.z;
  p.dashTicks = MOVE.dashTicks;
  p.dashCooldown = rules.dashCooldownTicks;
  if (p.wallRunning) endWallRun(p);
}

/** Set the velocity for one tick of dashing. Call only if p.dashTicks > 0. */
export function stepDash(p: PlayerState): void {
  p.dashTicks--;
  const speed = p.dashTicks > 0 ? MOVE.dashSpeed : MOVE.dashExitSpeed;
  p.vel.x = p.dashDirX * speed;
  p.vel.z = p.dashDirZ * speed;
  p.vel.y = 0;
}
