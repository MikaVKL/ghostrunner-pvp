/**
 * Geometry checks for melee combat. Pure functions, easy to unit test.
 */
import { forwardFromYaw, type Vec3 } from '../math/vec3';
import { PLAYER_HALF_WIDTH } from '../physics/collision';
import type { PlayerState } from '../sim/playerState';
import { COMBAT } from './combatConfig';
import type { AttackProfile } from './weapons';

/**
 * How directly `from` looks at `to`: 1 = straight at, 0 = sideways, -1 = facing away.
 * Returns 1 if both stand on the same spot.
 */
export function facingDot(from: PlayerState, to: Vec3): number {
  const dx = to.x - from.pos.x;
  const dz = to.z - from.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-6) return 1;
  const forward = forwardFromYaw(from.yaw);
  return (dx * forward.x + dz * forward.z) / dist;
}

/**
 * True if the target is inside the hit cone of `attacker`'s attack.
 * @param targetPos feet position of the target; pass a rewound position for lag compensation
 */
export function isInMeleeRange(
  attacker: PlayerState,
  target: PlayerState,
  weapon: AttackProfile,
  targetPos: Vec3 = target.pos,
): boolean {
  if (Math.abs(targetPos.y - attacker.pos.y) > COMBAT.verticalReach) return false;
  const dist = Math.hypot(targetPos.x - attacker.pos.x, targetPos.z - attacker.pos.z);
  if (dist > weapon.range + PLAYER_HALF_WIDTH) return false;
  const halfArc = (weapon.arcDegrees / 2) * (Math.PI / 180);
  return facingDot(attacker, targetPos) >= Math.cos(halfArc);
}

/** A parry only works if the defender roughly faces the attacker. */
export function isFacing(defender: PlayerState, attacker: PlayerState): boolean {
  return facingDot(defender, attacker.pos) > 0;
}
