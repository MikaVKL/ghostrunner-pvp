/**
 * Geometry checks for melee combat. Pure functions, easy to unit test.
 */
import { forwardFromYaw } from '../math/vec3';
import { PLAYER_HALF_WIDTH } from '../physics/collision';
import type { PlayerState } from '../sim/playerState';
import { COMBAT } from './combatConfig';
import type { AttackProfile } from './weapons';

/**
 * How directly `from` looks at `to`: 1 = straight at, 0 = sideways, -1 = facing away.
 * Returns 1 if both stand on the same spot.
 */
export function facingDot(from: PlayerState, to: PlayerState): number {
  const dx = to.pos.x - from.pos.x;
  const dz = to.pos.z - from.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-6) return 1;
  const forward = forwardFromYaw(from.yaw);
  return (dx * forward.x + dz * forward.z) / dist;
}

/** True if `target` is inside the hit cone of `attacker`'s attack. */
export function isInMeleeRange(
  attacker: PlayerState,
  target: PlayerState,
  weapon: AttackProfile,
): boolean {
  if (Math.abs(target.pos.y - attacker.pos.y) > COMBAT.verticalReach) return false;
  const dist = Math.hypot(target.pos.x - attacker.pos.x, target.pos.z - attacker.pos.z);
  if (dist > weapon.range + PLAYER_HALF_WIDTH) return false;
  const halfArc = (weapon.arcDegrees / 2) * (Math.PI / 180);
  return facingDot(attacker, target) >= Math.cos(halfArc);
}

/** A parry only works if the defender roughly faces the attacker. */
export function isFacing(defender: PlayerState, attacker: PlayerState): boolean {
  return facingDot(defender, attacker) > 0;
}
