/**
 * "Reaktor": a ring around a sunken fighting pit, with a long wall across the pit.
 *
 * Top view (X to the right, Z downward). Heights: ring y = 0, pit floor y = -3.
 *
 *   z=-17      +======= outer wall N (wall-run over floor) =======+
 *   z=-16 +[#]---------------------------------------------------------+
 *         |                         ring N                             |
 *   z=-6.5|              +------------------------------+              |
 *         |              | [PAD^]   pit floor    [PAD>] |              |
 *         | ring W       |            (y = -3)          |      ring E  |
 *         | spawn 0 -> ==+======= WALL (wall-run across the pit) ======+== <- spawn 1
 *         |              |                              |              |
 *         |              | [<PAD]               [PADv]  |              |
 *   z=6.5 |              +------------------------------+              |
 *         |                         ring S                             |
 *   z=16  +---------------------------------------------------------[#]+
 *   z=17       +======= outer wall S (wall-run over floor) =======+
 *       x=-16          x=-6.5       -5        5        x=6.5          x=16
 *
 * Ways to the other side:
 *   around - walk around the ring (safe and long)
 *   across - wall-run along the big wall, 13 m over the pit (the wall also blocks the view
 *            between the spawns)
 *   through- drop into the pit (3 m down), fight there, and leave on one of the four jump
 *            pads in its corners. Without a pad there is no way out of the pit.
 * Point-symmetric: (x, z) -> (-x, -z).
 */
import { at, boxFromBounds, jumpPad, type MapDef } from './mapTypes';

const RING = 0x1f2937;
const PIT = 0x2a3f3a;
const WALL = 0x30e070;
const OUTER = 0x14b8d4;
const CORNER = 0x6a3fd0;

const PIT_Y = -3;
/** Out of the pit: 3 m up and 5.5 m to the side. */
const PAD_UP = 13;
const PAD_SIDE = 7.3;

export const REAKTOR: MapDef = {
  id: 'reaktor',
  name: 'Reaktor',
  description: 'Ein Ring um eine versenkte Kampfgrube. Außen herum, per Wall-Run quer hinüber – oder hinunter in die Grube und per Sprungfeld wieder hinaus.',
  killY: -18,
  theme: { skyTop: 0x020806, skyMiddle: 0x0a2a24, skyHorizon: 0x2fa86a, fog: 0x0c1f1c },
  boxes: [
    boxFromBounds(-16, 16, -1, 0, -16, -6.5, RING), // ring N
    boxFromBounds(-16, 16, -1, 0, 6.5, 16, RING), // ring S
    boxFromBounds(-16, -6.5, -1, 0, -6.5, 6.5, RING), // ring W
    boxFromBounds(6.5, 16, -1, 0, -6.5, 6.5, RING), // ring E
    boxFromBounds(-5, 5, -4, PIT_Y, -5, 5, PIT), // the pit floor, 3 m below the ring
    boxFromBounds(-7.5, 7.5, -0.6, 6, -0.5, 0.5, WALL), // the wall across the pit (you can walk under it)
    boxFromBounds(-10, 10, -1, 5, -17, -16, OUTER), // outer wall N
    boxFromBounds(-10, 10, -1, 5, 16, 17, OUTER), // outer wall S
    boxFromBounds(-16, -13, 0, 1, -16, -13, CORNER), // raised corner NW
    boxFromBounds(13, 16, 0, 1, 13, 16, CORNER), // raised corner SE
  ],
  pads: [
    jumpPad(-3.5, 3.5, PIT_Y, { x: -PAD_SIDE, y: PAD_UP, z: 0 }), // to ring W
    jumpPad(3.5, -3.5, PIT_Y, { x: PAD_SIDE, y: PAD_UP, z: 0 }), // to ring E
    jumpPad(-3.5, -3.5, PIT_Y, { x: 0, y: PAD_UP, z: -PAD_SIDE }), // to ring N
    jumpPad(3.5, 3.5, PIT_Y, { x: 0, y: PAD_UP, z: PAD_SIDE }), // to ring S
  ],
  spawns: [
    { pos: at(-12, 0), yaw: -Math.PI / 2 },
    { pos: at(12, 0), yaw: Math.PI / 2 },
  ],
  navPoints: [
    at(-12, 0),
    at(12, 0),
    at(-12, -11), // ring corners
    at(12, -11),
    at(-12, 11),
    at(12, 11),
    at(0, -11), // ring N and S, middle
    at(0, 11),
    at(0, 2, PIT_Y), // pit, on both sides of the wall
    at(0, -2, PIT_Y),
    at(-2, 0, PIT_Y),
    at(2, 0, PIT_Y),
  ],
  links: [
    { kind: 'wallRun', from: at(-10, 0.95), to: at(8, 0.95) }, // along the big wall, W -> E
    { kind: 'wallRun', from: at(10, 0.95), to: at(-8, 0.95) },
    { kind: 'wallRun', from: at(-10, -0.95), to: at(8, -0.95) },
    { kind: 'wallRun', from: at(10, -0.95), to: at(-8, -0.95) },
    { kind: 'jump', from: at(-9, 1.8), to: at(-3, 1.8, PIT_Y) }, // drop into the pit from ring W
    { kind: 'jump', from: at(9, -1.8), to: at(3, -1.8, PIT_Y) }, // ... from ring E
    { kind: 'jump', from: at(-1.5, 3.5, PIT_Y), to: at(-9.2, 3.5) }, // pad: pit -> ring W
    { kind: 'jump', from: at(1.5, -3.5, PIT_Y), to: at(9.2, -3.5) }, // pad: pit -> ring E
    { kind: 'jump', from: at(-3.5, -1.5, PIT_Y), to: at(-3.5, -9.2) }, // pad: pit -> ring N
    { kind: 'jump', from: at(3.5, 1.5, PIT_Y), to: at(3.5, 9.2) }, // pad: pit -> ring S
  ],
};
