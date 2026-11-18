/**
 * Dash: a short burst of fast, straight, gravity-free movement.
 *
 * Dash charges (flow update, step 3): a player has up to MOVE.dashMaxCharges charges.
 * Every dash (and so every dash attack) costs one. An empty charge refills after
 * `dashRechargeTicks` (game mode), one at a time. In the air only ONE dash is possible
 * until the player touches the ground or a wall again (the charges are not refilled by
 * that, only the air limit). A hit or a successful parry gives a charge back
 * (refundDashCharge, decided by the server in resolveCombat.ts).
 */
import type { InputCmd } from '../input';
import { forwardFromYaw } from '../math/vec3';
import type { PlayerState } from '../sim/playerState';
import { MOVE } from './movementConfig';
import { endWallRun } from './wallRun';

export interface DashRules {
  /** False while the player may not dash at all (stunned, blocking). */
  canDash: boolean;
  /** Smallest time between the starts of two dashes (GameMode.dashCooldownTicks). */
  dashCooldownTicks: number;
  /** Time to refill one empty charge (GameMode.dashRechargeTicks). */
  dashRechargeTicks: number;
}

/** True if a dash could start right now (charges, gap, air limit). Bots use this too. */
export function canStartDash(p: PlayerState): boolean {
  if (p.dashTicks > 0 || p.dashCooldown > 0 || p.dashCharges <= 0) return false;
  return p.grounded || p.wallRunning || !p.airDashUsed;
}

/** Start a dash if it was pressed recently (input buffer) and one is available. Returns true if it started. */
export function tryStartDash(p: PlayerState, input: InputCmd, wish: { x: number; z: number }, rules: DashRules): boolean {
  if (!rules.canDash || !canStartDash(p) || p.bufferDash === 0) return false;
  p.bufferDash = 0;

  // Dash in the movement direction; if no direction is held, dash forward.
  const dir = wish.x !== 0 || wish.z !== 0 ? wish : forwardFromYaw(input.yaw);
  p.dashDirX = dir.x;
  p.dashDirZ = dir.z;
  p.dashTicks = MOVE.dashTicks;
  p.dashCooldown = rules.dashCooldownTicks;
  if (p.dashCharges === MOVE.dashMaxCharges) p.dashRecharge = rules.dashRechargeTicks;
  p.dashCharges--;
  if (!p.grounded && !p.wallRunning) p.airDashUsed = true;
  if (p.wallRunning) endWallRun(p);
  return true;
}

/** Refill empty charges one at a time. Call once per tick. */
export function rechargeDash(p: PlayerState, rechargeTicks: number): void {
  if (p.dashCharges >= MOVE.dashMaxCharges) return;
  if (--p.dashRecharge > 0) return;
  p.dashCharges++;
  p.dashRecharge = p.dashCharges < MOVE.dashMaxCharges ? rechargeTicks : 0;
}

/** A hit or a successful parry gives one charge back (the running refill timer keeps going). */
export function refundDashCharge(p: PlayerState): void {
  if (p.dashCharges >= MOVE.dashMaxCharges) return;
  p.dashCharges++;
  if (p.dashCharges === MOVE.dashMaxCharges) p.dashRecharge = 0;
}

/** Set the velocity for one tick of dashing. Call only if p.dashTicks > 0. */
export function stepDash(p: PlayerState): void {
  p.dashTicks--;
  const speed = p.dashTicks > 0 ? MOVE.dashSpeed : MOVE.dashExitSpeed;
  p.vel.x = p.dashDirX * speed;
  p.vel.z = p.dashDirZ * speed;
  p.vel.y = 0;
}
