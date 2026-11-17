/**
 * Lunge: a swing pushes the attacker forward a little (AttackProfile.lungeSpeed), so a
 * strike from a standstill still steps into the enemy. It never slows anyone down: a
 * sprinting player already faster than the lunge keeps its speed.
 * Depends only on the player's own state, so the client predicts it.
 */
import { getWeapon } from '../combat/weapons';
import { forwardFromYaw } from '../math/vec3';
import type { PlayerState } from '../sim/playerState';

/** Call after the normal locomotion of a tick (not while dashing, sliding or wall-running). */
export function applyLunge(p: PlayerState): void {
  if (p.lungeTicks <= 0) return;
  p.lungeTicks--;
  if (p.action !== 'attack') return;
  const speed = getWeapon(p.weaponId).attacks[p.attackKind].lungeSpeed;
  const forward = forwardFromYaw(p.yaw);
  const along = p.vel.x * forward.x + p.vel.z * forward.z;
  if (along >= speed) return;
  p.vel.x += forward.x * (speed - along);
  p.vel.z += forward.z * (speed - along);
}
