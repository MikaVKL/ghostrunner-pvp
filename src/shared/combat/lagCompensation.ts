/**
 * Lag compensation ("rewind"): being fair to players with ping.
 *
 * Every client shows the OTHER players slightly in the past (interpolation delay plus
 * network delay). Each input says which server tick its player was looking at
 * (`InputCmd.viewTick`). The server uses that in two places (see resolveCombat.ts):
 *
 *   1. Hits:   a swing is checked against where the target WAS at the attacker's
 *              viewTick - that is where the attacker saw it.
 *   2. Parry:  a swing that connected is decided only once the target has SEEN it
 *              (its viewTick reached the hit tick). If it parries until then, it counts.
 *
 * Both look back at most COMBAT.maxRewindTicks. All state lives in WorldState
 * (`history`, `pendingHits`) as plain data, so the simulation stays deterministic.
 */
import { clamp } from '../math/scalar';
import { cloneVec3, lerpVec3, type Vec3 } from '../math/vec3';
import type { WorldState } from '../sim/world';
import { COMBAT } from './combatConfig';

/** Remember where everyone stands now. Call once at the end of every tick. */
export function recordPositions(world: WorldState): void {
  const positions: Record<number, Vec3> = {};
  for (const p of world.players) positions[p.slot] = cloneVec3(p.pos);
  world.history.push({ tick: world.tick, positions });
  const excess = world.history.length - (COMBAT.maxRewindTicks + 2);
  if (excess > 0) world.history.splice(0, excess);
}

/**
 * The server tick a player was looking at, limited to the allowed rewind window.
 * Unknown (0) or future values mean "no rewind".
 */
export function effectiveViewTick(world: WorldState, viewTick: number | undefined): number {
  if (viewTick === undefined || viewTick <= 0) return world.tick;
  return clamp(viewTick, world.tick - COMBAT.maxRewindTicks, world.tick);
}

/**
 * Feet position of the player in `slot` at the (fractional) tick `tick`.
 * Falls back to the current position if the history does not reach that far.
 */
export function positionAt(world: WorldState, slot: number, tick: number): Vec3 | null {
  const current = world.players.find((p) => p.slot === slot)?.pos ?? null;
  if (!current || tick >= world.tick) return current;

  const history = world.history;
  for (let i = history.length - 1; i >= 0; i--) {
    const older = history[i];
    if (older.tick > tick) continue;
    const from = older.positions[slot];
    if (!from) return current;
    // The record after `older` is either the next history entry or the current state.
    const newer = history[i + 1];
    const to = newer ? newer.positions[slot] : current;
    const toTick = newer ? newer.tick : world.tick;
    if (!to || toTick <= older.tick) return from;
    return lerpVec3(from, to, (tick - older.tick) / (toTick - older.tick));
  }
  // Older than everything we remember: use the oldest known position.
  return history[0]?.positions[slot] ?? current;
}
