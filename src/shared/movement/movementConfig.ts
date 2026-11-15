/**
 * All movement tuning values in one place. Change numbers here to change the feel.
 * Speeds are meters/second, accelerations meters/second^2, durations ticks.
 * After changing values run `npm test` (some tests check e.g. the jump height).
 */
import { secondsToTicks } from '../config';

export const MOVE = {
  // --- running ---
  runSpeed: 7,
  groundAccel: 70,
  groundFriction: 60,
  /** How strongly you can steer in the air. */
  airAccel: 18,

  // --- jumping / falling ---
  gravity: 24,
  jumpSpeed: 8.5,
  terminalFallSpeed: 40,
  /** Grace period: you can still jump shortly after leaving a ledge. */
  coyoteTicks: secondsToTicks(0.1),

  // --- dash ---
  dashSpeed: 22,
  dashTicks: secondsToTicks(0.15),
  /** Horizontal speed kept when the dash ends. */
  dashExitSpeed: 8,
  dashCooldownTicks: secondsToTicks(1),

  // --- wall-run ---
  /** A wall counts as "touching" if it is at most this far from the player's side. */
  wallProbeDistance: 0.15,
  /** Minimum speed along the wall to start or keep a wall-run. */
  wallRunMinSpeed: 3,
  wallRunSpeed: 9,
  /** Fraction of normal gravity while wall-running. */
  wallRunGravityScale: 0.12,
  wallRunMaxFallSpeed: 2,
  /** Vertical speed is clamped into this range when a wall-run starts. */
  wallRunEntryMinVy: -1,
  wallRunEntryMaxVy: 3,
  /** Maximum total wall-run time before you must touch the ground again. */
  wallRunMaxTicks: secondsToTicks(1.5),
  /** After leaving a wall you cannot re-attach for this long. */
  wallCooldownTicks: secondsToTicks(0.25),
  /** Wall-jump: push away from the wall and upward. */
  wallJumpPush: 6,
  wallJumpUp: 8,
} as const;
