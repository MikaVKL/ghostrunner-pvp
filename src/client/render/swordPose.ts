/**
 * The first-person sword: translates the local player's combat state into where the
 * sword is on screen. Purely visual (the opponent's figure is animated in fighterPose.ts).
 */
import type { Object3D } from 'three';
import { currentAttack, isParryActive } from '../../shared/combat/actions';
import { lerp } from '../../shared/math/scalar';
import type { PlayerState } from '../../shared/sim/playerState';

/** Position (relative to the camera) and rotation of the sword. */
export interface SwordPose {
  x: number;
  y: number;
  z: number;
  rotX: number;
  rotY: number;
  rotZ: number;
}

/** Sword at rest: handle at the bottom right, blade pointing forward toward the middle. */
const REST: SwordPose = { x: 0.3, y: -0.3, z: -0.5, rotX: -1.05, rotY: 0, rotZ: 0.18 };
/** Raised to the top right before a normal swing. */
const RAISED: SwordPose = { x: 0.38, y: -0.06, z: -0.45, rotX: 0.3, rotY: 0, rotZ: -0.35 };
/** End of a normal swing: bottom left, blade far forward. */
const STRUCK: SwordPose = { x: -0.16, y: -0.38, z: -0.55, rotX: -1.75, rotY: 0, rotZ: 0.85 };
/** Dash attack: pulled back to the right, then sweeping flat to the left. */
const SIDE_BACK: SwordPose = { x: 0.46, y: -0.2, z: -0.4, rotX: -1.35, rotY: 0, rotZ: -1.1 };
const SIDE_THROUGH: SwordPose = { x: -0.36, y: -0.24, z: -0.58, rotX: -1.45, rotY: 0, rotZ: 1.35 };
/** Parry: blade held flat across the view. */
const GUARD: SwordPose = { x: 0.22, y: -0.16, z: -0.5, rotX: -0.3, rotY: 0, rotZ: 1.4 };
const STUNNED: SwordPose = { x: 0.46, y: -0.5, z: -0.45, rotX: -1.5, rotY: 0, rotZ: -0.7 };

function mix(a: SwordPose, b: SwordPose, t: number): SwordPose {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    z: lerp(a.z, b.z, t),
    rotX: lerp(a.rotX, b.rotX, t),
    rotY: lerp(a.rotY, b.rotY, t),
    rotZ: lerp(a.rotZ, b.rotZ, t),
  };
}

/** Smooth start and end of a movement (0..1 -> 0..1). Values above 1 (a mode with a longer
 * recovery, see GameMode.dashAttackExtraRecoveryTicks) stay at the end pose. */
const ease = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

export function swordPose(p: PlayerState): SwordPose {
  if (p.action === 'attack') {
    const attack = currentAttack(p);
    const [from, to] = p.attackKind === 'dash' ? [SIDE_BACK, SIDE_THROUGH] : [RAISED, STRUCK];
    const afterStartup = p.actionTicks - attack.startupTicks;
    if (afterStartup < 0) return mix(REST, from, ease(p.actionTicks / attack.startupTicks));
    if (afterStartup < attack.activeTicks) return mix(from, to, (afterStartup + 1) / attack.activeTicks);
    return mix(to, REST, ease((afterStartup - attack.activeTicks) / attack.recoveryTicks));
  }
  if (p.action === 'parry') return isParryActive(p) ? GUARD : mix(GUARD, REST, 0.6);
  if (p.action === 'stunned') return STUNNED;
  return REST;
}

/** Move the sword toward a pose (a little smoothing hides the 60 Hz steps). */
export function applySwordPose(sword: Object3D, pose: SwordPose, blend: number): void {
  sword.position.x += (pose.x - sword.position.x) * blend;
  sword.position.y += (pose.y - sword.position.y) * blend;
  sword.position.z += (pose.z - sword.position.z) * blend;
  sword.rotation.x += (pose.rotX - sword.rotation.x) * blend;
  sword.rotation.y += (pose.rotY - sword.rotation.y) * blend;
  sword.rotation.z += (pose.rotZ - sword.rotation.z) * blend;
}
