/**
 * All movement tuning values in one place. Change numbers here to change the feel.
 * Speeds are meters/second, accelerations meters/second^2, durations ticks.
 * After changing values run `npm test` (some tests check e.g. the jump height).
 */
import { secondsToTicks } from '../config';

export const MOVE = {
  // --- running ---
  /** Default speed: players always sprint (Ghostrunner style). Was 7 before the flow update. */
  runSpeed: 8.5,
  /** Speed while holding the walk key (C) - for careful footwork and spacing. */
  walkSpeed: 4,
  groundAccel: 70,
  groundFriction: 60,
  /** How strongly you can steer in the air. */
  airAccel: 18,
  /**
   * Keeping momentum: on the ground, speed ABOVE the top speed (after a dash, wall-jump,
   * jump pad or landing) only bleeds away at this rate (m/s^2) - as long as you keep
   * moving roughly the same way (see momentumMinAlign). Normal braking is groundAccel.
   */
  overspeedDecay: 9,
  /** cos of the largest angle between velocity and wished direction that keeps momentum (0.7 = 45°). */
  momentumMinAlign: 0.7,

  // --- crouch / slide (Ctrl) ---
  /** Speed while crouching (Ctrl held without enough speed for a slide). */
  crouchSpeed: 3.5,
  /** A slide starts only at (almost) sprint speed. */
  slideMinSpeed: 7.5,
  /** A slide starts at least this fast (a small boost from sprinting). */
  slideSpeed: 12.5,
  /** How fast a slide loses speed (m/s^2) - much less than normal braking. */
  slideFriction: 6,
  /** Longest slide (it also ends when Ctrl is released, on a jump or when leaving the ground). */
  slideTicks: secondsToTicks(0.7),
  /** Time from the end of one slide until the next can start (no endless boost by spamming). */
  slideCooldownTicks: secondsToTicks(0.6),

  // --- jumping / falling ---
  gravity: 24,
  jumpSpeed: 8.5,
  terminalFallSpeed: 40,
  /** Grace period: you can still jump shortly after leaving a ledge. */
  coyoteTicks: secondsToTicks(0.1),

  // --- double jump ---
  /** How many extra jumps are allowed in the air (0 = no double jump). */
  airJumps: 1,
  /** Upward speed of a jump in the air (a bit weaker than a jump from the ground). */
  airJumpSpeed: 7.5,

  // --- dash ---
  dashSpeed: 22,
  dashTicks: secondsToTicks(0.15),
  /** Horizontal speed kept when the dash ends (above run speed: the momentum carries on). */
  dashExitSpeed: 12,
  /** Smallest time between the starts of two dashes (the real limit are the charges). */
  dashCooldownTicks: secondsToTicks(0.35),
  /** Dash charges: at most this many, each one refills after dashRechargeTicks. */
  dashMaxCharges: 2,
  dashRechargeTicks: secondsToTicks(3),

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
