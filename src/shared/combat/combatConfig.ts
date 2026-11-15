/**
 * Combat tuning that is not specific to one weapon.
 */
import { secondsToTicks } from '../config';

export const COMBAT = {
  /** The parry blocks attacks during the first N ticks after pressing the button. */
  parryWindowTicks: secondsToTicks(0.2),
  /** After the window the player is vulnerable and cannot act for N ticks (punishes spam). */
  parryRecoveryTicks: secondsToTicks(0.35),
  /** An attacker whose swing was parried is stunned for N ticks. */
  parryStunTicks: secondsToTicks(0.8),
  /** Run speed multiplier while stunned. */
  stunnedSpeedFactor: 0.35,
  /** Run speed multiplier while holding a parry. */
  parrySpeedFactor: 0.6,
  /** A hit only connects if the height difference between the players is at most this. */
  verticalReach: 1.8,
  /** Upward speed (m/s) added to a target that gets hit, as a fraction of the knockback. */
  knockbackLift: 0.5,
} as const;
