/**
 * Very small path finding for bots.
 *
 * A straight line is "walkable" if there is floor under every sample point and nothing
 * in the way. If the direct line to the target is not walkable, the bot routes over the
 * map's hand-placed `navPoints` (shortest path, Dijkstra).
 */
import type { MapDef } from '../shared/maps/mapTypes';
import { horizontalDistance, type Vec3 } from '../shared/math/vec3';
import { PLAYER_HALF_WIDTH, PLAYER_HEIGHT } from '../shared/physics/collision';

const SAMPLE_SPACING = 0.5;
/** Bots keep this far away from floor edges. */
const EDGE_MARGIN = 0.3;
/** Maximum step up/down that still counts as the same floor. */
const MAX_STEP_UP = 0.3;
const MAX_STEP_DOWN = 0.6;

/** Height of the floor under a point, or null if there is none near height `y`. */
export function groundHeightAt(map: MapDef, x: number, z: number, y: number): number | null {
  let best: number | null = null;
  for (const box of map.boxes) {
    const inside = x >= box.min.x && x <= box.max.x && z >= box.min.z && z <= box.max.z;
    if (!inside) continue;
    const top = box.max.y;
    if (top > y + MAX_STEP_UP || top < y - MAX_STEP_DOWN) continue;
    if (best === null || top > best) best = top;
  }
  return best;
}

/** True if a box blocks a player standing at this point. */
function isBlocked(map: MapDef, x: number, z: number, groundY: number): boolean {
  const half = PLAYER_HALF_WIDTH;
  return map.boxes.some(
    (box) =>
      x + half > box.min.x &&
      x - half < box.max.x &&
      z + half > box.min.z &&
      z - half < box.max.z &&
      box.max.y > groundY + MAX_STEP_UP &&
      box.min.y < groundY + PLAYER_HEIGHT,
  );
}

/** True if a player can stand at this point, with some safety distance to floor edges. */
export function canStandAt(map: MapDef, x: number, z: number, y: number): boolean {
  const ground = groundHeightAt(map, x, z, y);
  if (ground === null || isBlocked(map, x, z, ground)) return false;
  // There must also be floor a bit to every side (floors may be made of several boxes).
  return (
    groundHeightAt(map, x - EDGE_MARGIN, z, y) !== null &&
    groundHeightAt(map, x + EDGE_MARGIN, z, y) !== null &&
    groundHeightAt(map, x, z - EDGE_MARGIN, y) !== null &&
    groundHeightAt(map, x, z + EDGE_MARGIN, y) !== null
  );
}

/** True if a bot can walk in a straight line from `a` to `b` without falling or bumping. */
export function isWalkable(map: MapDef, a: Vec3, b: Vec3): boolean {
  const dist = horizontalDistance(a, b);
  const steps = Math.max(1, Math.ceil(dist / SAMPLE_SPACING));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (!canStandAt(map, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, a.y)) return false;
  }
  return true;
}

/** Which nav points are connected by a walkable straight line (computed once per map). */
const navGraphCache = new WeakMap<MapDef, boolean[][]>();

function navGraph(map: MapDef): boolean[][] {
  let graph = navGraphCache.get(map);
  if (!graph) {
    const points = map.navPoints;
    graph = points.map((a, i) => points.map((b, j) => i !== j && isWalkable(map, a, b)));
    navGraphCache.set(map, graph);
  }
  return graph;
}

/**
 * The next point to walk to on the way from `from` to `to`.
 * Returns `to` if it can be reached directly, a nav point if a detour is needed,
 * or `from` (stand still) if there is no safe way at all.
 */
export function nextWaypoint(map: MapDef, from: Vec3, to: Vec3): Vec3 {
  if (isWalkable(map, from, to)) return to;

  const points = map.navPoints;
  const graph = navGraph(map);
  const count = points.length;
  // Dijkstra from `from` over the nav points. firstHop[i] = first nav point on the way to i.
  const cost = points.map((p) => (isWalkable(map, from, p) ? horizontalDistance(from, p) : Infinity));
  const firstHop = points.map((_, i) => i);
  const done = new Array<boolean>(count).fill(false);

  for (let round = 0; round < count; round++) {
    let current = -1;
    for (let i = 0; i < count; i++) {
      if (!done[i] && cost[i] < Infinity && (current < 0 || cost[i] < cost[current])) current = i;
    }
    if (current < 0) break;
    done[current] = true;
    for (let next = 0; next < count; next++) {
      if (!graph[current][next]) continue;
      const newCost = cost[current] + horizontalDistance(points[current], points[next]);
      if (newCost < cost[next]) {
        cost[next] = newCost;
        firstHop[next] = firstHop[current];
      }
    }
  }

  // Prefer nav points from which the target is directly reachable; otherwise get as close as possible.
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < count; i++) {
    if (cost[i] === Infinity) continue;
    const reachesTarget = isWalkable(map, points[i], to);
    const score = cost[i] + horizontalDistance(points[i], to) + (reachesTarget ? 0 : 1000);
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best < 0 ? from : points[firstHop[best]];
}
