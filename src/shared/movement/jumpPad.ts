/**
 * Jump pads: a player standing on one is thrown into the air with a fixed velocity.
 * Depends only on the player's own state and the map, so the client can predict it.
 */
import type { JumpPad, MapDef } from '../maps/mapTypes';
import type { PlayerState } from '../sim/playerState';
import { endWallRun } from './wallRun';

/** How far above/below the pad's height the feet may be (float rounding). */
const HEIGHT_TOLERANCE = 0.01;

/** The pad under the player's feet, or null. */
export function padUnder(p: PlayerState, map: MapDef): JumpPad | null {
  for (const pad of map.pads ?? []) {
    const inside = p.pos.x >= pad.min.x && p.pos.x <= pad.max.x && p.pos.z >= pad.min.z && p.pos.z <= pad.max.z;
    if (inside && Math.abs(p.pos.y - pad.min.y) <= HEIGHT_TOLERANCE) return pad;
  }
  return null;
}

/** Launch the player if it stands on a pad. Call after collision, once per tick. */
export function applyJumpPads(p: PlayerState, map: MapDef): void {
  if (!p.grounded || p.dashTicks > 0) return; // a dash carries you across a pad
  const pad = padUnder(p, map);
  if (!pad) return;
  p.vel.x = pad.launch.x;
  p.vel.y = pad.launch.y;
  p.vel.z = pad.launch.z;
  p.grounded = false;
  p.coyoteTicks = 0; // no extra jump on top of the launch (the double jump still works)
  if (p.wallRunning) endWallRun(p);
}
