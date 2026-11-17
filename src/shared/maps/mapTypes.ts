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

/**
 * A parkour shortcut that bots can take (humans can go wherever they want).
 *   jump    - run from `from` toward `to` and jump where the floor ends (or a ledge blocks).
 *             Also used for: dropping down to a lower floor, climbing a ledge up to ~2.4 m
 *             (the bot adds a double jump), and jump pads (put the pad between `from` and
 *             the edge - the bot runs over it and steers to `to` in the air).
 *   wallRun - run from `from` toward `to` along a wall, jump at the ledge, wall-run across
 * Rules: `from` and `to` are on walkable ground (they may have different heights). For
 * 'wallRun' the line from->to must be parallel to the wall, 0.45 m away from its face
 * (see HOW_TO_EXTEND.md, "Neue Map").
 */
export interface ParkourLink {
  kind: 'jump' | 'wallRun';
  from: Vec3;
  to: Vec3;
}

/**
 * A jump pad: a flat rectangle on a floor. Whoever steps on it is thrown into the air
 * with exactly the velocity `launch` (so the flight always follows the same arc).
 */
export interface JumpPad {
  /** The rectangle on the ground (the y of both corners is the floor height). */
  min: Vec3;
  max: Vec3;
  /** Velocity in m/s the player gets. y must be > 0. */
  launch: Vec3;
}

/** The colors of a map's sky and fog (0xRRGGBB). Only the look - ignored by the simulation. */
export interface MapTheme {
  skyTop: number;
  skyMiddle: number;
  skyHorizon: number;
  /** Fog, the mist in the abyss and everything below the horizon. */
  fog: number;
}

export interface MapDef {
  id: string;
  /** Display name (German, shown in the menu). */
  name: string;
  /** One sentence for the map selection in the menu (German). */
  description: string;
  boxes: Box[];
  /** One spawn per player slot (index = slot). */
  spawns: SpawnPoint[];
  /** Falling below this height kills the player. */
  killY: number;
  /** Hand-placed points on walkable ground that bots use to find paths (e.g. bridge ends). */
  navPoints: Vec3[];
  /** Parkour shortcuts for bots (one entry per direction). May be empty. */
  links: ParkourLink[];
  /** Jump pads. May be left out. */
  pads?: JumpPad[];
  /** Sky and fog colors. May be left out (then the default night sky is used). */
  theme?: MapTheme;
}

/**
 * Create a square jump pad of 2 x 2 m centered at (x, z) on a floor at height `y`.
 * `launch` is the velocity the player gets, e.g. { x: 6, y: 13, z: 0 }.
 */
export function jumpPad(x: number, z: number, y: number, launch: Vec3, size = 2): JumpPad {
  const half = size / 2;
  return { min: { x: x - half, y, z: z - half }, max: { x: x + half, y, z: z + half }, launch };
}

/** Shorthand for a point on the ground. */
export function at(x: number, z: number, y = 0): Vec3 {
  return { x, y, z };
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
