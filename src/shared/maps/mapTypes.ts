/**
 * A map is plain data: a list of axis-aligned boxes plus spawn points.
 * The same data is used for collision (server + client) and for rendering (client).
 */
import type { Vec3 } from '../math/vec3';

/** Axis-aligned box. Everything solid in a map is one of these. */
export interface Box {
  min: Vec3;
  max: Vec3;
  /** Render color (0xRRGGBB). Ignored by the simulation. */
  color: number;
}

export interface SpawnPoint {
  /** Feet position. */
  pos: Vec3;
  yaw: number;
}

export interface MapDef {
  id: string;
  name: string;
  boxes: Box[];
  /** One spawn per player slot (index = slot). */
  spawns: SpawnPoint[];
  /** Falling below this height kills the player. */
  killY: number;
  /** Hand-placed points on walkable ground that bots use to find paths (e.g. bridge ends). */
  navPoints: Vec3[];
}

/** Create a box from its center and size. Easier to read than min/max when building maps. */
export function boxFromCenter(
  cx: number,
  cy: number,
  cz: number,
  sizeX: number,
  sizeY: number,
  sizeZ: number,
  color = 0x8899aa,
): Box {
  return {
    min: { x: cx - sizeX / 2, y: cy - sizeY / 2, z: cz - sizeZ / 2 },
    max: { x: cx + sizeX / 2, y: cy + sizeY / 2, z: cz + sizeZ / 2 },
    color,
  };
}

/** Create a box from two corner coordinates per axis. */
export function boxFromBounds(
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
  color = 0x8899aa,
): Box {
  return {
    min: { x: Math.min(x0, x1), y: Math.min(y0, y1), z: Math.min(z0, z1) },
    max: { x: Math.max(x0, x1), y: Math.max(y0, y1), z: Math.max(z0, z1) },
    color,
  };
}
