/**
 * Wall-run: while airborne, next to a wall and holding forward, the player slides along
 * the wall with almost no gravity. Jump pushes off the wall (wall-jump).
 */
import { TICK_DT } from '../config';
import type { InputCmd } from '../input';
import type { MapDef } from '../maps/mapTypes';
import { clamp } from '../math/scalar';
import type { PlayerState } from '../sim/playerState';
import { MOVE } from './movementConfig';
import { findWall } from './wallProbe';

export function endWallRun(p: PlayerState): void {
  p.wallRunning = false;
  p.wallCooldown = MOVE.wallCooldownTicks;
  p.wallNormalX = 0;
  p.wallNormalZ = 0;
}

/**
 * Decide whether the player starts, continues or stops wall-running this tick.
 * While running, the horizontal velocity is redirected along the wall.
 */
export function updateWallRun(p: PlayerState, input: InputCmd, map: MapDef): void {
  const allowed = !p.grounded && p.wallCooldown === 0 && p.wallRunLeft > 0 && input.moveZ > 0;
  const wall = allowed ? findWall(p.pos, map.boxes) : null;
  if (!wall) {
    if (p.wallRunning) endWallRun(p);
    return;
  }

  // Direction along the wall (perpendicular to the normal), pointing the way we are moving.
  let tangentX = -wall.nz;
  let tangentZ = wall.nx;
  let speedAlongWall = p.vel.x * tangentX + p.vel.z * tangentZ;
  if (speedAlongWall < 0) {
    tangentX = -tangentX;
    tangentZ = -tangentZ;
    speedAlongWall = -speedAlongWall;
  }

  if (speedAlongWall < MOVE.wallRunMinSpeed) {
    if (p.wallRunning) endWallRun(p);
    return;
  }

  if (!p.wallRunning) {
    p.wallRunning = true;
    p.vel.y = clamp(p.vel.y, MOVE.wallRunEntryMinVy, MOVE.wallRunEntryMaxVy);
  }
  p.wallNormalX = wall.nx;
  p.wallNormalZ = wall.nz;
  const speed = Math.max(speedAlongWall, MOVE.wallRunSpeed);
  p.vel.x = tangentX * speed;
  p.vel.z = tangentZ * speed;
}

/** Vertical motion and wall-jump while wall-running. Call only if p.wallRunning. */
export function stepWallRun(p: PlayerState, jumpPressed: boolean): void {
  p.wallRunLeft--;
  if (jumpPressed) {
    p.vel.x += p.wallNormalX * MOVE.wallJumpPush;
    p.vel.z += p.wallNormalZ * MOVE.wallJumpPush;
    p.vel.y = MOVE.wallJumpUp;
    endWallRun(p);
    return;
  }
  const gravity = MOVE.gravity * MOVE.wallRunGravityScale;
  p.vel.y = Math.max(p.vel.y - gravity * TICK_DT, -MOVE.wallRunMaxFallSpeed);
  if (p.wallRunLeft <= 0) endWallRun(p);
}
