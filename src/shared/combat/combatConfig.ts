/**
 * Combat tuning that is not specific to one weapon (parry, stun, dash attack, lag
 * compensation). Weapon values (damage, reach, swing timing) are in weapons.ts.
 */
import { secondsToTicks } from '../config';

export const COMBAT = {
  // --- guard: parry + block (combat/guard.ts) ---
  /** A new press of the guard key parries during the first N ticks. */
  parryWindowTicks: secondsToTicks(0.15),
  /** The next parry window is ready N ticks after the last one started (mashing only blocks). */
  parryCooldownTicks: secondsToTicks(0.5),
  /** An attacker whose swing was parried is stunned for N ticks (unless its posture breaks). */
  parryStunTicks: secondsToTicks(0.6),
  /** Horizontal speed (m/s) that pushes a parried attacker away from the defender. */
  parryPushback: 5,
  /** Upward speed (m/s) of the parry push: a small hop, so that ground friction does not eat it. */
  parryLift: 3.5,

  // --- blade clash ---
  /**
   * Two swings that would land within this many ticks of each other do not kill: the
   * blades clash and both fighters are thrown back.
   */
  clashWindowTicks: secondsToTicks(0.1),
  /** Horizontal speed (m/s) that pushes both fighters apart after a clash. */
  clashPushback: 7,
  /** Upward speed (m/s) of a clash: a small hop, so that ground friction does not eat the push. */
  clashLift: 3,
  /** After a clash neither fighter can swing again for N ticks. */
  clashCooldownTicks: secondsToTicks(0.35),

  // --- movement while acting ---
  /** Run speed multiplier while stunned. */
  stunnedSpeedFactor: 0.35,

  // --- posture (combat/posture.ts) ---
  /** A full bar breaks the posture. */
  postureMax: 100,
  /** A parry adds this much to the ATTACKER's posture (blocking adds AttackProfile.postureDamage to the defender's). */
  parryPostureDamage: 40,
  /** A broken posture stuns this long; afterwards the bar is empty. */
  postureBreakTicks: secondsToTicks(1.5),
  /** Without new posture damage for this long, the bar starts to drain ... */
  postureRegenDelayTicks: secondsToTicks(1),
  /** ... at this rate (points per second). */
  postureRegenPerSecond: 12,
  /** Speed (m/s) that pushes a blocked attacker back. */
  blockPushback: 3,

  // --- dash attack ---
  /** An attack started while dashing, or up to N ticks after the dash ended, is a dash attack. */
  dashAttackGraceTicks: secondsToTicks(0.1),
  /** A dash attack that hit nothing recovers this much longer (the price of missing). */
  dashAttackMissRecoveryTicks: secondsToTicks(0.35),

  // --- lag compensation (see combat/lagCompensation.ts) ---
  /**
   * How far back in time the server looks when checking a hit or a parry. Covers the
   * interpolation delay (100 ms) plus the ping. Players with more lag than this simply
   * lose the part beyond it.
   */
  maxRewindTicks: secondsToTicks(0.3),

  // --- air attack ---
  /** An air attack lifts the attacker to at least this upward speed (m/s): a short hang in the air. */
  airAttackHop: 2.5,

  // --- aim assist (Button.AimAssist, a setting) ---
  /**
   * With aim assist the hit cone of a swing is this many degrees wider on EACH side: a
   * swing that is slightly off still turns onto the enemy. Decided by the server, like
   * every hit; off = exactly the cone of the attack profile.
   */
  aimAssistDegrees: 12,

  // --- hit geometry ---
  /** Upward speed (m/s) added to a target that gets hit, as a fraction of the knockback. */
  knockbackLift: 0.5,
} as const;
