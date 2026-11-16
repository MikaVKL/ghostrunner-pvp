/**
 * Turns "I want to move in THIS direction of the world" into the movement keys a player
 * has (forward/back, left/right), for a given view direction. That lets a bot look at its
 * opponent while walking somewhere else - sideways around a pillar, or backward.
 */
import { forwardFromYaw, rightFromYaw } from '../shared/math/vec3';

export interface Direction {
  x: number;
  z: number;
}

export interface MoveKeys {
  moveX: number;
  moveZ: number;
}

export const NO_KEYS: MoveKeys = { moveX: 0, moveZ: 0 };

/** Unit vector from `from` toward `to` on the ground plane, or null if they are (almost) the same point. */
export function directionTo(from: Direction, to: Direction): Direction | null {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  return length < 1e-6 ? null : { x: dx / length, z: dz / length };
}

/**
 * The keys that move a player looking along `yaw` as closely as possible in direction `dir`.
 * Keys allow only 8 directions, so the result can be up to 22.5 degrees off.
 */
export function keysFor(dir: Direction | null, yaw: number): MoveKeys {
  if (!dir) return NO_KEYS;
  const forward = forwardFromYaw(yaw);
  const right = rightFromYaw(yaw);
  const along = dir.x * forward.x + dir.z * forward.z;
  const sideways = dir.x * right.x + dir.z * right.z;
  const key = (amount: number) => (amount > 0.38 ? 1 : amount < -0.38 ? -1 : 0);
  return { moveX: key(sideways), moveZ: key(along) };
}

/** The world direction in which the given keys really move a player looking along `yaw`. */
export function directionOf(keys: MoveKeys, yaw: number): Direction | null {
  if (keys.moveX === 0 && keys.moveZ === 0) return null;
  const forward = forwardFromYaw(yaw);
  const right = rightFromYaw(yaw);
  const x = forward.x * keys.moveZ + right.x * keys.moveX;
  const z = forward.z * keys.moveZ + right.z * keys.moveX;
  const length = Math.hypot(x, z);
  return { x: x / length, z: z / length };
}
