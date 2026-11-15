/**
 * Translates a player's combat state into a simple sword pose. Used for the opponent's
 * avatar and for the first-person sword, so both always show the same thing.
 * This is purely visual - replace it with real animations later.
 */
import type { MeshStandardMaterial, Object3D } from 'three';
import { isParryActive } from '../../shared/combat/actions';
import { getWeapon } from '../../shared/combat/weapons';
import { lerp } from '../../shared/math/scalar';
import type { PlayerState } from '../../shared/sim/playerState';

export interface SwordPose {
  /** Forward swing angle in radians (negative = wound up backward). */
  swing: number;
  /** 0 = normal, 1 = sword held across the body (parry). */
  guard: number;
  /** Blade color (0xRRGGBB). */
  color: number;
}

const BLADE = 0xdfe6ee;
const BLADE_ACTIVE = 0xff5a3c;
const BLADE_PARRY = 0x4fb4ff;
const BLADE_STUNNED = 0xf2c744;

export function swordPose(p: PlayerState): SwordPose {
  if (p.action === 'attack') {
    const weapon = getWeapon(p.weaponId);
    const afterStartup = p.actionTicks - weapon.startupTicks;
    if (afterStartup < 0) {
      // wind up
      return { swing: lerp(0, -0.7, p.actionTicks / weapon.startupTicks), guard: 0, color: BLADE };
    }
    if (afterStartup < weapon.activeTicks) {
      // the dangerous part of the swing
      return { swing: lerp(-0.7, 1.5, (afterStartup + 1) / weapon.activeTicks), guard: 0, color: BLADE_ACTIVE };
    }
    const recovery = (afterStartup - weapon.activeTicks) / weapon.recoveryTicks;
    return { swing: lerp(1.5, 0, recovery), guard: 0, color: BLADE };
  }
  if (p.action === 'parry') {
    return isParryActive(p)
      ? { swing: 0, guard: 1, color: BLADE_PARRY }
      : { swing: 0, guard: 0.4, color: BLADE };
  }
  if (p.action === 'stunned') return { swing: 1.1, guard: 0, color: BLADE_STUNNED };
  return { swing: 0, guard: 0, color: BLADE };
}

/**
 * Apply a pose to a sword model (see sword.ts: origin at the handle, blade pointing up).
 * @param restAngle how far the sword leans forward when idle, in radians
 */
export function applySwordPose(
  sword: Object3D,
  blade: MeshStandardMaterial,
  pose: SwordPose,
  restAngle: number,
): void {
  sword.rotation.x = -(restAngle + pose.swing);
  sword.rotation.z = pose.guard * 1.3;
  blade.color.setHex(pose.color);
}
