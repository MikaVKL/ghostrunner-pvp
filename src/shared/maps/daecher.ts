/**
 * "Dächer": three rooftops with gaps between them.
 *
 * Top view (X to the right, Z downward), all roofs have their top at y = 0:
 *
 *   z=-8        +===== WALL 1 (wall-run) =====+
 *   z=-7 +-----------+                 +-----------+                 +-----------+
 *        |           |                 |           |                 |    [AC]   |
 *        | roof A    |                 |  roof M   +====catwalk 2====+   roof B  |
 *        | spawn 0 ->|     [step 1]    |  [block]  |     [step 2]    |<- spawn 1 |
 *        |           +====catwalk 1====+           |                 |           |
 *        |   [AC]    |                 |           |                 |           |
 *   z=7  +-----------+                 +-----------+                 +-----------+
 *   z=8                                      +===== WALL 2 (wall-run) =====+
 *      x=-24       x=-12             x=-5         x=5              x=12        x=24
 *
 * Ways across each 7 m gap: the narrow catwalk (safe), two 2 m jumps over the step in
 * the middle, or a wall-run along the billboard wall.
 * Point-symmetric: (x, z) -> (-x, -z).
 */
import { at, boxFromBounds, boxFromCenter, type MapDef, type ParkourLink } from './mapTypes';

const ROOF = 0x262c40;
const CATWALK = 0x4a5578;
const STEP = 0x3c4a70;
const WALL = 0xf0a020;
const BLOCK = 0x14b8d4;
const AC = 0x596080;
const SIGN = 0xd4267a;

/** A jump link in both directions. */
function jumps(ax: number, bx: number): ParkourLink[] {
  return [
    { kind: 'jump', from: at(ax, 0), to: at(bx, 0) },
    { kind: 'jump', from: at(bx, 0), to: at(ax, 0) },
  ];
}

export const DAECHER: MapDef = {
  id: 'daecher',
  name: 'Dächer',
  description: 'Drei Hochhausdächer: über Stege balancieren, über Lücken springen oder an Werbewänden entlanglaufen.',
  killY: -16,
  boxes: [
    boxFromBounds(-24, -12, -1, 0, -7, 7, ROOF), // roof A
    boxFromBounds(12, 24, -1, 0, -7, 7, ROOF), // roof B
    boxFromBounds(-5, 5, -1, 0, -7, 7, ROOF), // roof M (middle)
    boxFromBounds(-12, -5, -1, 0, 4, 5.6, CATWALK), // catwalk 1 (A - M)
    boxFromBounds(5, 12, -1, 0, -5.6, -4, CATWALK), // catwalk 2 (M - B)
    boxFromBounds(-10, -7, -1, 0, -1.5, 1.5, STEP), // step 1 in the gap A - M
    boxFromBounds(7, 10, -1, 0, -1.5, 1.5, STEP), // step 2 in the gap M - B
    boxFromBounds(-15, -2, -3, 6, -8, -7, WALL), // wall 1 (its face at z = -7 looks toward +Z)
    boxFromBounds(2, 15, -3, 6, 7, 8, WALL), // wall 2 (its face at z = 7 looks toward -Z)
    boxFromCenter(0, 0.5, 0, 3, 1, 3, BLOCK), // block in the middle of roof M (jumpable)
    boxFromCenter(-20, 0.6, 4.5, 2, 1.2, 2, AC), // air conditioner on A
    boxFromCenter(20, 0.6, -4.5, 2, 1.2, 2, AC), // air conditioner on B
    boxFromCenter(-23, 3, -4, 1, 6, 3, SIGN), // neon sign on A
    boxFromCenter(23, 3, 4, 1, 6, 3, SIGN), // neon sign on B
  ],
  spawns: [
    { pos: at(-18, 0), yaw: -Math.PI / 2 },
    { pos: at(18, 0), yaw: Math.PI / 2 },
  ],
  navPoints: [
    at(-18, 0),
    at(18, 0),
    at(-12.5, 4.8), // catwalk 1 ends
    at(-4.5, 4.8),
    at(4.5, -4.8), // catwalk 2 ends
    at(12.5, -4.8),
    at(3.5, 3.5), // ways around the block on roof M
    at(-3.5, -3.5),
  ],
  links: [
    ...jumps(-13.5, -8.5), // A <-> step 1
    ...jumps(-8.5, -3.5), // step 1 <-> M
    ...jumps(3.5, 8.5), // M <-> step 2
    ...jumps(8.5, 13.5), // step 2 <-> B
    { kind: 'wallRun', from: at(-14, -6.55), to: at(-3.5, -6.55) }, // wall 1, A -> M
    { kind: 'wallRun', from: at(-3, -6.55), to: at(-13.5, -6.55) }, // wall 1, M -> A
    { kind: 'wallRun', from: at(3, 6.55), to: at(13.5, 6.55) }, // wall 2, M -> B
    { kind: 'wallRun', from: at(14, 6.55), to: at(3.5, 6.55) }, // wall 2, B -> M
  ],
};
