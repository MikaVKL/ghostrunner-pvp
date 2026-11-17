/**
 * "Dächer": a tower between two rooftops. The vertical map - whoever holds the tower
 * roof (4 m up) has the high ground.
 *
 * Top view (X to the right, Z downward). Heights: roofs A/B and the ring around the
 * tower y = 0, terraces y = 2, tower roof y = 4.
 *
 *   z=-8.6            +------ledge N------+=====catwalk 2=====+
 *   z=-8    +==WALL 1 (wall-run)==+       |                   |
 *   z=-7 +----------+       +-----+-------+-----+       +-----+----+
 *        |   [PAD]>>|       | ter-|             | ter-  |          |
 *        | roof A   |       | race|   TOWER     | race  |  roof B  |
 *        | spawn 0->|       |  L  |   (y = 4)   |  R    |<- spawn 1|
 *        |          |       |(y=2)|             |(y=2)  |<<[PAD]   |
 *   z=7  +-----+----+       +-----+-------+-----+       +----------+
 *   z=8        |                  |       +==WALL 2 (wall-run)==+
 *   z=8.6      +=====catwalk 1====+------ledge S------+
 *      x=-26  -16  -14     -12   -7  -5        5  7   12    14  16    26
 *
 * Ways to the other side:
 *   low    - catwalk 1, around the tower on the ledges, catwalk 2 (safe, but long and exposed)
 *   fast   - wall-run along WALL 1 / WALL 2 instead of a catwalk
 *   high   - the jump pad throws you straight onto the tower roof; or climb roof -> terrace
 *            -> tower with double jumps. From up there you can drop anywhere.
 * Point-symmetric: (x, z) -> (-x, -z).
 */
import { at, boxFromBounds, boxFromCenter, jumpPad, type MapDef, type ParkourLink } from './mapTypes';

const ROOF = 0x262c40;
const LEDGE = 0x313a58;
const CATWALK = 0x4a5578;
const TERRACE = 0x35507a;
const TOWER = 0x1f6fb0;
const WALL = 0xf0a020;
const AC = 0x596080;
const SIGN = 0xd4267a;

const DEEP = -14; // everything reaches down below the kill height, like real buildings

/** The same link on both halves of the map: (x, z) -> (-x, -z). */
function mirrored(kind: ParkourLink['kind'], from: [number, number, number], to: [number, number, number]): ParkourLink[] {
  const [fx, fy, fz] = from;
  const [tx, ty, tz] = to;
  return [
    { kind, from: at(fx, fz, fy), to: at(tx, tz, ty) },
    { kind, from: at(-fx, -fz, fy), to: at(-tx, -tz, ty) },
  ];
}

export const DAECHER: MapDef = {
  id: 'daecher',
  name: 'Dächer',
  description: 'Die Höhen-Map: Ein Turm zwischen zwei Dächern. Sprungfelder und Doppelsprünge führen nach oben, Stege und Werbewände unten herum.',
  killY: -12,
  theme: { skyTop: 0x02030a, skyMiddle: 0x0c1c44, skyHorizon: 0x1f7fa8, fog: 0x0d1830 },
  boxes: [
    boxFromBounds(-26, -14, DEEP, 0, -7, 7, ROOF), // roof A
    boxFromBounds(14, 26, DEEP, 0, -7, 7, ROOF), // roof B
    boxFromBounds(-5, 5, DEEP, 4, -5, 5, TOWER), // the tower (its roof is 4 m up)
    boxFromBounds(-12, -7, DEEP, 2, -4, 4, TERRACE), // terrace L (2 m up)
    boxFromBounds(7, 12, DEEP, 2, -4, 4, TERRACE), // terrace R
    // The ring around the foot of the tower.
    boxFromBounds(-7, 7, DEEP, 0, -8.6, -5, LEDGE), // ledge N
    boxFromBounds(-7, 7, DEEP, 0, 5, 8.6, LEDGE), // ledge S
    boxFromBounds(-7, -5, DEEP, 0, -5, 5, LEDGE), // ledge W
    boxFromBounds(5, 7, DEEP, 0, -5, 5, LEDGE), // ledge E
    boxFromBounds(-16, -7, -1, 0, 7, 8.6, CATWALK), // catwalk 1 (roof A - ledge S)
    boxFromBounds(7, 16, -1, 0, -8.6, -7, CATWALK), // catwalk 2 (ledge N - roof B)
    boxFromBounds(-17, -5.5, -3, 6, -8, -7, WALL), // wall 1 (its face at z = -7 looks toward +Z)
    boxFromBounds(5.5, 17, -3, 6, 7, 8, WALL), // wall 2 (its face at z = 7 looks toward -Z)
    boxFromCenter(-22, 0.6, 4.5, 2, 1.2, 2, AC), // air conditioner on A (cover)
    boxFromCenter(22, 0.6, -4.5, 2, 1.2, 2, AC), // air conditioner on B
    boxFromCenter(-25, 3, -4, 1, 6, 3, SIGN), // neon sign on A
    boxFromCenter(25, 3, 4, 1, 6, 3, SIGN), // neon sign on B
    boxFromCenter(0, 4.6, 0, 2, 1.2, 2, AC), // cover on the tower roof
  ],
  pads: [
    // 12 m far and up onto the tower roof (highest point of the flight: 5.3 m).
    jumpPad(-15.5, -4.5, 0, { x: 12, y: 16, z: 1.5 }),
    jumpPad(15.5, 4.5, 0, { x: -12, y: 16, z: -1.5 }),
  ],
  spawns: [
    { pos: at(-20, 0), yaw: -Math.PI / 2 },
    { pos: at(20, 0), yaw: Math.PI / 2 },
  ],
  navPoints: [
    at(-20, 0), // roofs
    at(20, 0),
    at(-15, 7.8), // catwalk 1
    at(-7.5, 7.8),
    at(15, -7.8), // catwalk 2
    at(7.5, -7.8),
    at(-6, 6.8), // corners of the ring around the tower
    at(6, 6.2),
    at(6, -6.8),
    at(-6, -6.2),
    at(-6, 0),
    at(6, 0),
    at(-9.5, 0, 2), // terraces
    at(9.5, 0, 2),
    at(-3.5, 3.5, 4), // tower roof, around the cover
    at(3.5, -3.5, 4),
    at(-3.5, -3.5, 4),
    at(3.5, 3.5, 4),
  ],
  links: [
    ...mirrored('wallRun', [-16.5, 0, -6.55], [-6.2, 0, -6.55]), // wall 1: roof A -> ledge N (wall 2: B -> ledge S)
    ...mirrored('wallRun', [-5.9, 0, -6.55], [-15.5, 0, -6.55]), // and back
    ...mirrored('jump', [-18, 0, -4.77], [-3.5, 4, -3]), // jump pad: roof -> tower roof
    ...mirrored('jump', [-16, 0, 2], [-10, 2, 2]), // climb: roof -> terrace (double jump)
    ...mirrored('jump', [-10, 2, 2], [-16.5, 0, 2]), // drop: terrace -> roof
    ...mirrored('jump', [-10.5, 2, -2], [-3.5, 4, -2]), // climb: terrace -> tower roof (double jump)
    ...mirrored('jump', [-3.5, 4, -2], [-10, 2, -2]), // drop: tower roof -> terrace
    ...mirrored('jump', [-2, 4, 3.2], [-2, 0, 6.8]), // drop: tower roof -> ledge S (and N)
  ],
};
