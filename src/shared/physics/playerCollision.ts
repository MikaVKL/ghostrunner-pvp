/**
 * Player-vs-player collision: players cannot walk (or dash) through each other.
 *
 * This is an INTERACTION (it depends on the other player), so it runs in part 2 of
 * stepWorld and only the server decides it. Two overlapping players are pushed apart by
 * the same amount each. The push goes through the normal map collision, so nobody is
 * shoved into a wall.
 *
 * Players are treated as upright cylinders here (radius = half the box width), which
 * makes sliding around each other feel smooth.
 */
import type { MapDef } from '../maps/mapTypes';
import type { PlayerState } from '../sim/playerState';
import { CROUCH_HEIGHT, moveAndCollide, PLAYER_HALF_WIDTH, PLAYER_HEIGHT } from './collision';

/** Two players may not come closer than this (center to center, on the ground plane). */
export const PLAYER_MIN_DISTANCE = PLAYER_HALF_WIDTH * 2;

/** Current body height: lower while crouching or sliding. */
export function heightOf(p: PlayerState): number {
  return p.crouching ? CROUCH_HEIGHT : PLAYER_HEIGHT;
}

/**
 * A dash goes right through the enemy (dodge past, get behind). Not a dash ATTACK: that one
 * stops at the body, otherwise it would fly past its target and miss.
 */
export function passesThrough(p: PlayerState): boolean {
  return p.dashTicks > 0 && p.action !== 'attack';
}

function heightsOverlap(a: PlayerState, b: PlayerState): boolean {
  return a.pos.y < b.pos.y + heightOf(b) && b.pos.y < a.pos.y + heightOf(a);
}

/** Move a player by a small offset, stopping at map boxes. Its velocity is not touched. */
function push(p: PlayerState, dx: number, dz: number, map: MapDef): void {
  moveAndCollide(p.pos, { x: dx, y: 0, z: dz }, map.boxes, 1, heightOf(p));
}

/** Push apart every pair of living players that overlaps. */
export function separatePlayers(players: PlayerState[], map: MapDef): void {
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i];
      const b = players[j];
      if (!a.alive || !b.alive || !heightsOverlap(a, b)) continue;
      if (passesThrough(a) || passesThrough(b)) continue;
      let dx = b.pos.x - a.pos.x;
      let dz = b.pos.z - a.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist >= PLAYER_MIN_DISTANCE) continue;
      if (dist < 1e-6) {
        // Exactly on top of each other: pick a fixed direction (must be deterministic).
        dx = 1;
        dz = 0;
      } else {
        dx /= dist;
        dz /= dist;
      }
      const half = (PLAYER_MIN_DISTANCE - dist) / 2;
      push(a, -dx * half, -dz * half, map);
      push(b, dx * half, dz * half, map);
    }
  }
}
