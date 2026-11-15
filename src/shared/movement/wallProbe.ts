/**
 * Finds a wall right next to the player (needed for wall-running).
 * A "wall" is a vertical side face of a map box that covers the player's torso.
 */
import type { Vec3 } from '../math/vec3';
import type { Box } from '../maps/mapTypes';
import { PLAYER_HALF_WIDTH } from '../physics/collision';
import { MOVE } from './movementConfig';

export interface WallContact {
  /** Wall normal (unit length, horizontal, pointing from the wall toward the player). */
  nx: number;
  nz: number;
  /** Gap between the player's side and the wall in meters. */
  gap: number;
}

/** Torso range relative to the feet. The wall must cover this whole range. */
const TORSO_LOW = 0.5;
const TORSO_HIGH = 1.3;
const TOLERANCE = 1e-4;

function coversTorso(pos: Vec3, box: Box): boolean {
  return box.min.y <= pos.y + TORSO_LOW && box.max.y >= pos.y + TORSO_HIGH;
}

function rangesOverlap(minA: number, maxA: number, minB: number, maxB: number): boolean {
  return maxA > minB + TOLERANCE && minA < maxB - TOLERANCE;
}

/** Returns the closest wall within MOVE.wallProbeDistance, or null. */
export function findWall(pos: Vec3, boxes: Box[]): WallContact | null {
  const reach = MOVE.wallProbeDistance;
  const half = PLAYER_HALF_WIDTH;
  let best: WallContact | null = null;

  const consider = (gap: number, nx: number, nz: number) => {
    if (gap < -TOLERANCE || gap > reach) return;
    if (!best || gap < best.gap) best = { nx, nz, gap };
  };

  for (const box of boxes) {
    if (!coversTorso(pos, box)) continue;
    if (rangesOverlap(pos.z - half, pos.z + half, box.min.z, box.max.z)) {
      consider(pos.x - half - box.max.x, 1, 0); // wall face looking toward +X
      consider(box.min.x - (pos.x + half), -1, 0); // wall face looking toward -X
    }
    if (rangesOverlap(pos.x - half, pos.x + half, box.min.x, box.max.x)) {
      consider(pos.z - half - box.max.z, 0, 1); // wall face looking toward +Z
      consider(box.min.z - (pos.z + half), 0, -1); // wall face looking toward -Z
    }
  }
  return best;
}
