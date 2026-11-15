/**
 * "Reaktor": a ring around a deep pit with a platform in the middle.
 *
 * Top view (X to the right, Z downward), all floors have their top at y = 0:
 *
 *   z=-17      +======= outer wall N (wall-run over floor) =======+
 *   z=-16 +[#]---------------------------------------------------------+
 *         |                         ring N                             |
 *   z=-8  |          +---------------------||-----------------+        |
 *         |          |  (pit)        bridge||N                |        |
 *         |      ====+=WALL A====+---------++--------+        |        |
 *         | ring W   |           |     platform      |        | ring E |
 *         | spawn 0->|           |      [cover]      |        |<-spawn 1
 *         |          |           +--------++---------+====WALL B=+==== |
 *         |          |                  S ||bridge     (pit)  |        |
 *   z=8   |          +--------------------||------------------+        |
 *         |                         ring S                             |
 *   z=16  +---------------------------------------------------------[#]+
 *   z=17       +======= outer wall S (wall-run over floor) =======+
 *       x=-16      x=-8        x=-4               x=4        x=8      x=16
 *
 * Ways to the middle: around the ring and over bridge N or S (safe), or a short
 * wall-run along WALL A / WALL B straight across the pit.
 * Point-symmetric: (x, z) -> (-x, -z).
 */
import { at, boxFromBounds, boxFromCenter, type MapDef } from './mapTypes';

const RING = 0x1f2937;
const PLATFORM = 0x2c3a52;
const BRIDGE = 0x47557a;
const WALL = 0x30e070;
const OUTER = 0x14b8d4;
const COVER = 0xf0a020;
const CORNER = 0x6a3fd0;

export const REAKTOR: MapDef = {
  id: 'reaktor',
  name: 'Reaktor',
  description: 'Ein Ring um einen tiefen Schacht. Außen herum ist sicher, per Wall-Run geht es quer hinüber.',
  killY: -18,
  boxes: [
    boxFromBounds(-16, 16, -1, 0, -16, -8, RING), // ring N
    boxFromBounds(-16, 16, -1, 0, 8, 16, RING), // ring S
    boxFromBounds(-16, -8, -1, 0, -8, 8, RING), // ring W
    boxFromBounds(8, 16, -1, 0, -8, 8, RING), // ring E
    boxFromBounds(-4, 4, -1, 0, -5, 5, PLATFORM), // platform in the middle
    boxFromBounds(-1, 1, -1, 0, -8, -5, BRIDGE), // bridge N
    boxFromBounds(-1, 1, -1, 0, 5, 8, BRIDGE), // bridge S
    boxFromBounds(-9.5, -3, -3, 6, -6, -5, WALL), // wall A (its face at z = -5 looks toward +Z)
    boxFromBounds(3, 9.5, -3, 6, 5, 6, WALL), // wall B (its face at z = 5 looks toward -Z)
    boxFromBounds(-10, 10, -1, 5, -17, -16, OUTER), // outer wall N
    boxFromBounds(-10, 10, -1, 5, 16, 17, OUTER), // outer wall S
    boxFromCenter(0, 0.6, 0, 2, 1.2, 2, COVER), // cover on the platform (jumpable)
    boxFromBounds(-16, -13, 0, 1, -16, -13, CORNER), // raised corner NW
    boxFromBounds(13, 16, 0, 1, 13, 16, CORNER), // raised corner SE
  ],
  spawns: [
    { pos: at(-12, 0), yaw: -Math.PI / 2 },
    { pos: at(12, 0), yaw: Math.PI / 2 },
  ],
  navPoints: [
    at(-12, 0),
    at(12, 0),
    at(-12, -12), // ring corners
    at(12, -12),
    at(-12, 12),
    at(12, 12),
    at(0, -12), // in front of the bridges
    at(0, 12),
    at(0, -8.5), // bridge ends
    at(0, -4.3),
    at(0, 4.3),
    at(0, 8.5),
    at(-2.5, 0), // left and right of the cover
    at(2.5, 0),
  ],
  links: [
    { kind: 'wallRun', from: at(-10.5, -4.55), to: at(-2.5, -4.55) }, // wall A, ring W -> platform
    { kind: 'wallRun', from: at(-2.5, -4.55), to: at(-10.5, -4.55) }, // wall A, platform -> ring W
    { kind: 'wallRun', from: at(10.5, 4.55), to: at(2.5, 4.55) }, // wall B, ring E -> platform
    { kind: 'wallRun', from: at(2.5, 4.55), to: at(10.5, 4.55) }, // wall B, platform -> ring E
  ],
};
