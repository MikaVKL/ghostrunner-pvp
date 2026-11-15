/**
 * Default 1v1 map: two islands over a void, connected by a narrow bridge.
 *
 * Top view (X to the right, Z downward), the floor top is at y = 0:
 *
 *        z=-10  +--------WALL S (wall-run)--------+
 *               |             :     :             |
 *   +-----------+------+      :     :      +------+-----------+
 *   |  island A        |      : gap :      |        island B  |
 *   |   [cover]        +======bridge=======+                  |
 *   |  spawn 0 ->      +===================+      <- spawn 1  |
 *   |                  |      : (void)     |        [cover]   |
 *   +-----------+------+      :     :      +------+-----------+
 *               |             :     :             |
 *        z=+10  +--------WALL N (wall-run)--------+
 *              x=-20   x=-4              x=4    x=20
 *
 * Ways across the 8 m gap: the bridge (safe), a wall-run along WALL N/S, or jump + dash.
 */
import { boxFromBounds, boxFromCenter, type MapDef } from './mapTypes';

const FLOOR = 0x4a5568;
const BRIDGE = 0x718096;
const WALL = 0x2b6cb0;
const COVER = 0xc05621;

export const ARENA: MapDef = {
  id: 'arena',
  name: 'Arena',
  killY: -15,
  boxes: [
    boxFromBounds(-20, -4, -1, 0, -9, 9, FLOOR), // island A
    boxFromBounds(4, 20, -1, 0, -9, 9, FLOOR), // island B
    boxFromBounds(-4, 4, -1, 0, -1.5, 1.5, BRIDGE), // bridge
    boxFromBounds(-8, 8, -1, 6, 9, 10, WALL), // wall N (spans the gap)
    boxFromBounds(-8, 8, -1, 6, -10, -9, WALL), // wall S
    boxFromCenter(-12, 0.6, 5, 2, 1.2, 2, COVER), // cover block on A (jumpable)
    boxFromCenter(12, 0.6, -5, 2, 1.2, 2, COVER), // cover block on B
  ],
  spawns: [
    { pos: { x: -14, y: 0, z: 0 }, yaw: -Math.PI / 2 }, // looks toward +X
    { pos: { x: 14, y: 0, z: 0 }, yaw: Math.PI / 2 }, // looks toward -X
  ],
  navPoints: [
    { x: -14, y: 0, z: 0 },
    { x: -5, y: 0, z: 0 }, // bridge end A
    { x: 5, y: 0, z: 0 }, // bridge end B
    { x: 14, y: 0, z: 0 },
    { x: -12, y: 0, z: -5 },
    { x: 12, y: 0, z: 5 },
  ],
};
