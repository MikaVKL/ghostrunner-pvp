/**
 * Collision between the player (an upright box) and the map (static boxes).
 *
 * Method: move one axis at a time (X, then Z, then Y). After each move, push the
 * player back out of any box it now overlaps. Simple, robust and deterministic.
 */
import type { Vec3 } from '../math/vec3';
import type { Box } from '../maps/mapTypes';

/** Half of the player's width/depth in meters. */
export const PLAYER_HALF_WIDTH = 0.4;
/** Player height in meters. `pos` is the feet, so the head is at pos.y + PLAYER_HEIGHT. */
export const PLAYER_HEIGHT = 1.8;
/** Camera height above the feet. */
export const EYE_HEIGHT = 1.6;
/** Player height while crouching or sliding, and the camera height then. */
export const CROUCH_HEIGHT = 1.1;
export const CROUCH_EYE_HEIGHT = 0.95;

/** Tolerance so that "exactly touching" does not count as overlapping (float rounding). */
const EPSILON = 1e-6;
/** Longest distance moved in one sub-step. Must be smaller than the thinnest box. */
const MAX_STEP = 0.2;

type Axis = 'x' | 'y' | 'z';

/** True if a player standing at `pos` (`height` tall) intersects the box. */
export function playerOverlapsBox(pos: Vec3, box: Box, height = PLAYER_HEIGHT): boolean {
  return (
    pos.x + PLAYER_HALF_WIDTH > box.min.x + EPSILON &&
    pos.x - PLAYER_HALF_WIDTH < box.max.x - EPSILON &&
    pos.y + height > box.min.y + EPSILON &&
    pos.y < box.max.y - EPSILON &&
    pos.z + PLAYER_HALF_WIDTH > box.min.z + EPSILON &&
    pos.z - PLAYER_HALF_WIDTH < box.max.z - EPSILON
  );
}

/** Push the player out of every overlapping box along one axis. Returns true if blocked. */
function resolveAxis(pos: Vec3, boxes: Box[], axis: Axis, delta: number, height: number): boolean {
  if (delta === 0) return false;
  let blocked = false;
  for (const box of boxes) {
    if (!playerOverlapsBox(pos, box, height)) continue;
    blocked = true;
    if (axis === 'y') {
      pos.y = delta > 0 ? box.min.y - height : box.max.y;
    } else {
      pos[axis] = delta > 0 ? box.min[axis] - PLAYER_HALF_WIDTH : box.max[axis] + PLAYER_HALF_WIDTH;
    }
  }
  return blocked;
}

export interface MoveResult {
  /** True if the player landed on (or is standing on) something this tick. */
  grounded: boolean;
}

/**
 * Move `pos` by `vel * dt` and stop at solid boxes. Modifies `pos` and `vel` in place:
 * the velocity component that ran into something is set to 0.
 */
export function moveAndCollide(pos: Vec3, vel: Vec3, boxes: Box[], dt: number, height = PLAYER_HEIGHT): MoveResult {
  const dx = vel.x * dt;
  const dy = vel.y * dt;
  const dz = vel.z * dt;
  // Split fast movement into small steps so we can never jump through a thin box.
  const longest = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
  const steps = Math.max(1, Math.ceil(longest / MAX_STEP));
  let grounded = false;

  for (let i = 0; i < steps; i++) {
    pos.x += dx / steps;
    if (resolveAxis(pos, boxes, 'x', dx, height)) vel.x = 0;

    pos.z += dz / steps;
    if (resolveAxis(pos, boxes, 'z', dz, height)) vel.z = 0;

    pos.y += dy / steps;
    if (resolveAxis(pos, boxes, 'y', dy, height)) {
      if (dy < 0) grounded = true;
      vel.y = 0;
    }
  }
  return { grounded };
}

/** True if a player `height` tall fits at `pos` without touching any box (e.g. to stand up). */
export function fitsAt(pos: Vec3, boxes: Box[], height = PLAYER_HEIGHT): boolean {
  return !boxes.some((box) => playerOverlapsBox(pos, box, height));
}
