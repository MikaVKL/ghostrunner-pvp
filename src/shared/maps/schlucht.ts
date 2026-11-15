/**
 * "Neonschlucht": two platforms over a canyon. Default map.
 *
 * Top view (X to the right, Z downward), all floors have their top at y = 0:
 *
 *   z=-9   +=========== WALL S (wall-run, 10 m gap) ===========+
 *   z=-8 +-----------------+                       +-----------------+
 *        |  platform A     |        (void)         |     platform B  |
 *        |      [cover]    |        +-----+        |          |pillar|
 *        | spawn 0 ->      +=bridge=+ mid +=bridge=+      <- spawn 1 |
 *        ||pillar          |        +-----+        |    [cover]      |
 *   z=8  +-----------------+                       +-----------------+
 *   z=9    +=========== WALL N (wall-run, 10 m gap) ===========+
 *       x=-21            x=-5      -2   2         x=5              x=21
 *
 * Ways across: the 2 m wide bridge over the middle island (safe, but you meet head-on),
 * or a wall-run along WALL N / WALL S (fast, flanks the bridge).
 * The map is point-symmetric: (x, z) -> (-x, -z), so both sides are equal.
 */
import { at, boxFromBounds, boxFromCenter, type MapDef } from './mapTypes';

const FLOOR = 0x232a3d;
const BRIDGE = 0x3a4566;
const WALL = 0x14b8d4;
const COVER = 0xd4267a;
const PILLAR = 0x6a3fd0;

export const SCHLUCHT: MapDef = {
  id: 'schlucht',
  name: 'Neonschlucht',
  description: 'Zwei Plattformen, eine schmale Brücke und zwei lange Wände zum Wall-Run über den Abgrund.',
  killY: -14,
  boxes: [
    boxFromBounds(-21, -5, -1, 0, -8, 8, FLOOR), // platform A
    boxFromBounds(5, 21, -1, 0, -8, 8, FLOOR), // platform B
    boxFromBounds(-2, 2, -1, 0, -2, 2, FLOOR), // middle island
    boxFromBounds(-5, -2, -1, 0, -1, 1, BRIDGE), // bridge A - middle
    boxFromBounds(2, 5, -1, 0, -1, 1, BRIDGE), // bridge middle - B
    boxFromBounds(-9, 9, -3, 7, 8, 9, WALL), // wall N (its face at z = 8 looks toward -Z)
    boxFromBounds(-9, 9, -3, 7, -9, -8, WALL), // wall S (its face at z = -8 looks toward +Z)
    boxFromCenter(-11, 0.6, -3.5, 2, 1.2, 2, COVER), // cover on A (jumpable)
    boxFromCenter(11, 0.6, 3.5, 2, 1.2, 2, COVER), // cover on B
    boxFromCenter(-18.5, 2.5, 5.5, 1.5, 5, 1.5, PILLAR), // pillar on A
    boxFromCenter(18.5, 2.5, -5.5, 1.5, 5, 1.5, PILLAR), // pillar on B
  ],
  spawns: [
    { pos: at(-16, 0), yaw: -Math.PI / 2 }, // looks toward +X
    { pos: at(16, 0), yaw: Math.PI / 2 }, // looks toward -X
  ],
  navPoints: [
    at(-16, 0),
    at(-5.5, 0), // bridge end A
    at(0, 0), // middle island
    at(5.5, 0), // bridge end B
    at(16, 0),
    at(-13, -6.5), // way around the cover to wall S
    at(13, 6.5), // way around the cover to wall N
  ],
  links: [
    { kind: 'wallRun', from: at(-8, 7.55), to: at(7.5, 7.55) }, // wall N, A -> B
    { kind: 'wallRun', from: at(8, 7.55), to: at(-7.5, 7.55) }, // wall N, B -> A
    { kind: 'wallRun', from: at(-8, -7.55), to: at(7.5, -7.55) }, // wall S, A -> B
    { kind: 'wallRun', from: at(8, -7.55), to: at(-7.5, -7.55) }, // wall S, B -> A
  ],
};
