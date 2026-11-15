/**
 * Combat tuning that is not specific to one weapon (parry, stun, dash attack, lag
 * compensation). Weapon values (damage, reach, swing timing) are in weapons.ts.
 */
import { secondsToTicks } from '../config';

export const COMBAT = {
  // --- parry ---
  /** The parry blocks attacks during the first N ticks after pressing the button. */
  parryWindowTicks: secondsToTicks(0.25),
  /** After the window the player is vulnerable and cannot act for N ticks (punishes spam). */
  parryRecoveryTicks: secondsToTicks(0.3),
  /** After a parry that blocked nothing, the next parry may start only after N ticks. */
  parryCooldownTicks: secondsToTicks(0.5),
  /** An attacker whose swing was parried is stunned for N ticks. */
  parryStunTicks: secondsToTicks(1),
  /** Horizontal speed (m/s) that pushes a parried attacker away from the defender. */
  parryPushback: 4,

  // --- movement while acting ---
  /** Run speed multiplier while stunned. */
  stunnedSpeedFactor: 0.35,
  /** Run speed multiplier while holding a parry. */
  parrySpeedFactor: 0.6,

  // --- dash attack ---
  /** An attack started while dashing, or up to N ticks after the dash ended, is a dash attack. */
  dashAttackGraceTicks: secondsToTicks(0.1),

  // --- hit geometry ---
  /** A hit only connects if the height difference between the players is at most this. */
  verticalReach: 1.8,
  /** Upward speed (m/s) added to a target that gets hit, as a fraction of the knockback. */
  knockbackLift: 0.5,
} as const;
