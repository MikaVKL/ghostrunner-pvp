/**
 * Global timing constants shared by server, client and bots.
 *
 * RULE: game logic never uses seconds or Date.now(). It counts TICKS.
 * One tick is one fixed simulation step (1/60 s).
 */

/** Simulation steps per second. Server and client MUST use the same value. */
export const TICK_RATE = 60;

/** Length of one tick in seconds (used by physics formulas). */
export const TICK_DT = 1 / TICK_RATE;

/** Length of one tick in milliseconds (used by timers/loops). */
export const TICK_MS = 1000 / TICK_RATE;

/** The server sends a snapshot every N ticks (2 => 30 snapshots per second). */
export const SNAPSHOT_EVERY_TICKS = 2;

/**
 * Input buffer: a press of attack, parry, dash or jump is remembered this long and done
 * as soon as it becomes possible (e.g. a jump pressed just before landing).
 */
export const INPUT_BUFFER_TICKS = 9; // 0.15 s

/** Bump this when the network protocol changes in an incompatible way. */
export const PROTOCOL_VERSION = 8;

/** This template is 1v1. */
export const MAX_PLAYERS_PER_ROOM = 2;

/** Convert seconds to a whole number of ticks. Use this for all durations in configs. */
export function secondsToTicks(seconds: number): number {
  return Math.round(seconds * TICK_RATE);
}
