/**
 * Animates a FighterModel from a PlayerState: running, jumping, wall-run, dash, sword
 * swing, parry and stun. Purely visual - it only reads the state.
 *
 * Angles: a positive rotation.x swings a hanging limb FORWARD; a negative rotation.x of
 * the body leans it forward; a positive rotation.z leans the body to its left.
 */
import { currentAttack, isParryActive } from '../../shared/combat/actions';
import { lerp } from '../../shared/math/scalar';
import { rightFromYaw } from '../../shared/math/vec3';
import { MOVE } from '../../shared/movement/movementConfig';
import type { PlayerState } from '../../shared/sim/playerState';
import type { FighterModel } from './fighterModel';

/** Sword arm angle when nothing happens: sword held low in front. */
const ARM_REST = 0.45;
const SWORD_REST_TILT = -Math.PI / 2;

/** Animation memory of one figure (kept by PlayerAvatar). */
export interface FighterAnim {
  /** Grows with the distance run; drives the leg swing. */
  runPhase: number;
  /** Seconds since the avatar was created (for wobbling). */
  time: number;
}

/** 0..1: how far the swing is through its current phase, plus which phase it is. */
function swingProgress(p: PlayerState): { phase: 'startup' | 'active' | 'recovery'; t: number } {
  const attack = currentAttack(p);
  const afterStartup = p.actionTicks - attack.startupTicks;
  if (afterStartup < 0) return { phase: 'startup', t: p.actionTicks / attack.startupTicks };
  if (afterStartup < attack.activeTicks) return { phase: 'active', t: (afterStartup + 1) / attack.activeTicks };
  // Capped at 1: a mode may add extra recovery (the fighter then just holds the end pose).
  return { phase: 'recovery', t: Math.min(1, (afterStartup - attack.activeTicks) / attack.recoveryTicks) };
}

function poseLegsAndLean(m: FighterModel, p: PlayerState, anim: FighterAnim): void {
  const speed = Math.hypot(p.vel.x, p.vel.z);
  const stride = Math.min(1, speed / MOVE.runSpeed);
  const swing = Math.sin(anim.runPhase) * 0.95 * stride;

  if (p.slideTicks > 0) {
    // Slide: leaning back, the legs shoot forward.
    m.body.rotation.x = 0.45;
    m.legLeft.rotation.x = 1.35;
    m.legRight.rotation.x = 1.0;
    m.armLeft.rotation.x = -0.6;
    m.armLeft.rotation.z = -0.8;
  } else if (p.dashTicks > 0) {
    m.body.rotation.x = -0.65;
    m.legLeft.rotation.x = -0.5;
    m.legRight.rotation.x = -0.9;
    m.armLeft.rotation.x = -1.0;
  } else if (p.wallRunning) {
    // Lean away from the wall, legs sprint.
    const right = rightFromYaw(p.yaw);
    const wallOnRight = p.wallNormalX * right.x + p.wallNormalZ * right.z < 0;
    m.body.rotation.z = wallOnRight ? 0.38 : -0.38;
    m.body.rotation.x = -0.25;
    m.legLeft.rotation.x = swing * 1.1;
    m.legRight.rotation.x = -swing * 1.1;
    m.armLeft.rotation.x = -swing * 0.8;
  } else if (!p.grounded) {
    // In the air: one knee up, arm out for balance.
    m.body.rotation.x = -0.1;
    m.legLeft.rotation.x = 0.7;
    m.legRight.rotation.x = -0.35;
    m.armLeft.rotation.x = -0.5;
    m.armLeft.rotation.z = -0.5;
  } else {
    m.body.rotation.x = -0.14 * stride;
    m.legLeft.rotation.x = swing;
    m.legRight.rotation.x = -swing;
    m.armLeft.rotation.x = -swing * 0.7;
    m.body.position.y = 0.9 + Math.abs(Math.cos(anim.runPhase)) * 0.04 * stride + Math.sin(anim.time * 2) * 0.006;
  }
}

/**
 * @param big clearer wind-up (telegraph setting): the sword is drawn back further, the
 *   body leans back and twists away, the free arm points at the target
 */
function poseSwordArm(m: FighterModel, p: PlayerState, anim: FighterAnim, big: boolean): void {
  const arm = m.armRight.rotation;
  const sword = m.sword.group.rotation;

  if (p.action === 'attack') {
    const { phase, t } = swingProgress(p);
    if (p.attackKind === 'dash') {
      // Horizontal slash: arm stretched forward, the body turns through.
      const back = big ? -1.4 : -0.9;
      sword.x = -Math.PI * 0.85;
      arm.x = 1.35;
      const twist = phase === 'startup' ? lerp(0, back, t) : phase === 'active' ? lerp(back, 1.0, t) : lerp(1.0, 0, t);
      m.body.rotation.y = twist;
      arm.z = -twist * 0.5;
    } else {
      // Overhead cut: raise the sword behind the head, strike down, return.
      const top = big ? 3.05 : 2.7;
      const turn = big ? -0.6 : -0.35;
      arm.x = phase === 'startup' ? lerp(ARM_REST, top, t) : phase === 'active' ? lerp(top, 0.15, t) : lerp(0.15, ARM_REST, t);
      arm.z = phase === 'active' ? lerp(0.35, -0.2, t) : 0;
      m.body.rotation.y = phase === 'startup' ? lerp(0, turn, t) : phase === 'active' ? lerp(turn, 0.35, t) : lerp(0.35, 0, t);
    }
    if (big && phase === 'startup') {
      m.body.rotation.x += 0.22 * t; // lean back
      m.armLeft.rotation.x = 1.4 * t; // free hand points at the target
    }
    return;
  }
  if (p.action === 'guard') {
    // Sword held across the body: high and tight in the parry window, a bit lower when blocking.
    const guard = isParryActive(p) ? 1 : 0.8;
    arm.x = lerp(ARM_REST, 1.25, guard);
    arm.z = 0.75 * guard;
    sword.x = SWORD_REST_TILT;
    sword.z = 1.2 * guard;
    m.armLeft.rotation.x = 1.0 * guard;
    return;
  }
  if (p.action === 'stunned') {
    // Staggering: leaning back, sword arm thrown out, head shaking.
    const wobble = Math.sin(anim.time * 22) * 0.07;
    m.body.rotation.x = 0.28 + wobble;
    m.head.rotation.x = 0.35;
    m.head.rotation.z = wobble * 2;
    arm.x = -0.4;
    arm.z = -0.9;
    m.armLeft.rotation.z = 0.7;
    return;
  }
  arm.x = ARM_REST + Math.sin(anim.time * 2) * 0.03;
}

function resetPose(m: FighterModel): void {
  for (const part of [m.body, m.head, m.armLeft, m.armRight, m.legLeft, m.legRight]) part.rotation.set(0, 0, 0);
  m.body.position.y = 0.9;
  m.sword.group.rotation.set(SWORD_REST_TILT, 0, 0);
}

/** Set every joint of the figure for this frame. */
export function poseFighter(m: FighterModel, p: PlayerState, anim: FighterAnim, telegraph = false): void {
  resetPose(m);
  poseLegsAndLean(m, p, anim);
  poseSwordArm(m, p, anim, telegraph);
}
