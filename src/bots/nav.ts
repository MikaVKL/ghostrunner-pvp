/**
 * Very small path finding for bots.
 *
 * A straight line is "walkable" if there is floor under every sample point and nothing
 * in the way. If the direct line to the target is not walkable, the bot routes over a
 * graph (shortest path, Dijkstra) made of
 *   - the map's hand-placed `navPoints`, connected where a straight line is walkable
 *   - the map's parkour `links` (jumps, wall-runs), each a one-way connection
 */
import type { MapDef, ParkourLink } from '../shared/maps/mapTypes';
import { horizontalDistance, type Vec3 } from '../shared/math/vec3';
import { PLAYER_HALF_WIDTH, PLAYER_HEIGHT } from '../shared/physics/collision';

const SAMPLE_SPACING = 0.5;
/** Bots keep this far away from floor edges. */
const EDGE_MARGIN = 0.3;
/** Maximum step up/down that still counts as the same floor. */
const MAX_STEP_UP = 0.3;
const MAX_STEP_DOWN = 0.6;
/** Closer than this to a graph node counts as "standing on it". */
export const ARRIVE_DISTANCE = 0.35;

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

/** Floor height if a player can stand at this point (with some distance to floor edges), else null. */
export function standHeightAt(map: MapDef, x: number, z: number, y: number): number | null {
  const ground = groundHeightAt(map, x, z, y);
  if (ground === null || isBlocked(map, x, z, ground)) return null;
  // There must also be floor a bit to every side (floors may be made of several boxes).
  const ok =
    groundHeightAt(map, x - EDGE_MARGIN, z, y) !== null &&
    groundHeightAt(map, x + EDGE_MARGIN, z, y) !== null &&
    groundHeightAt(map, x, z - EDGE_MARGIN, y) !== null &&
    groundHeightAt(map, x, z + EDGE_MARGIN, y) !== null;
  return ok ? ground : null;
}

export function canStandAt(map: MapDef, x: number, z: number, y: number): boolean {
  return standHeightAt(map, x, z, y) !== null;
}

/** True if a bot can walk in a straight line from `a` to `b` without falling or bumping. */
export function isWalkable(map: MapDef, a: Vec3, b: Vec3): boolean {
  const dist = horizontalDistance(a, b);
  const steps = Math.max(1, Math.ceil(dist / SAMPLE_SPACING));
  let y = a.y;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const ground = standHeightAt(map, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, y);
    if (ground === null) return false;
    y = ground; // follow small steps up and down
  }
  return true;
}

/**
 * The closest spot around `pos` where a player can stand safely, or null if there is
 * none within 2.4 m. Used when the bot ended up on the very edge of a platform, from
 * where no straight line counts as "walkable".
 */
export function nearestStandable(map: MapDef, pos: Vec3): Vec3 | null {
  for (let radius = 0.4; radius <= 2.4; radius += 0.4) {
    for (let step = 0; step < 12; step++) {
      const angle = (step / 12) * Math.PI * 2;
      const x = pos.x + Math.cos(angle) * radius;
      const z = pos.z + Math.sin(angle) * radius;
      const ground = standHeightAt(map, x, z, pos.y);
      if (ground !== null) return { x, y: ground, z };
    }
  }
  return null;
}

/** One connection of the nav graph: walk in a straight line, or take a parkour link. */
interface Edge {
  to: number;
  link: ParkourLink | null;
}

interface NavGraph {
  nodes: Vec3[];
  edges: Edge[][];
}

/** The graph is computed once per map. */
const navGraphCache = new WeakMap<MapDef, NavGraph>();

function navGraph(map: MapDef): NavGraph {
  const cached = navGraphCache.get(map);
  if (cached) return cached;
  const nodes: Vec3[] = [];
  const indexOf = (p: Vec3): number => {
    const found = nodes.findIndex((n) => n.x === p.x && n.y === p.y && n.z === p.z);
    return found >= 0 ? found : nodes.push(p) - 1;
  };
  for (const point of map.navPoints) indexOf(point);
  const linkEnds = map.links.map((link) => ({ link, from: indexOf(link.from), to: indexOf(link.to) }));

  const edges: Edge[][] = nodes.map((a, i) =>
    nodes.flatMap((b, j) => (i !== j && isWalkable(map, a, b) ? [{ to: j, link: null }] : [])),
  );
  for (const { link, from, to } of linkEnds) edges[from].push({ to, link });

  const graph = { nodes, edges };
  navGraphCache.set(map, graph);
  return graph;
}

export interface NavStep {
  /** Walk to this point next. */
  target: Vec3;
  /** If set: `target` is the start of this parkour link; take the link once you stand there. */
  link: ParkourLink | null;
}

/** How long a parkour link "feels" to a bot: a multiplier on its length, per link or for all. */
export type LinkCost = number | ((link: ParkourLink) => number);

/**
 * The next thing to do on the way from `from` to `to`.
 * @param linkCost multiplier on the length of parkour links (< 1 = the bot loves parkour,
 *                 Infinity = never use links). A function gives every link its own value.
 * Returns `to` if it can be reached directly, a graph node if a detour is needed,
 * or `from` (stand still) if there is no safe way at all.
 */
export function planRoute(map: MapDef, from: Vec3, to: Vec3, linkCost: LinkCost = 1): NavStep {
  if (isWalkable(map, from, to)) return { target: to, link: null };

  const { nodes, edges } = navGraph(map);
  const count = nodes.length;
  // Dijkstra from `from`. prev[i] = node before i on the best path (-1 = directly from `from`).
  const cost = nodes.map((p) => (isWalkable(map, from, p) ? horizontalDistance(from, p) : Infinity));
  const prev = new Array<number>(count).fill(-1);
  const via = new Array<ParkourLink | null>(count).fill(null);
  const done = new Array<boolean>(count).fill(false);

  for (let round = 0; round < count; round++) {
    let current = -1;
    for (let i = 0; i < count; i++) {
      if (!done[i] && cost[i] < Infinity && (current < 0 || cost[i] < cost[current])) current = i;
    }
    if (current < 0) break;
    done[current] = true;
    for (const edge of edges[current]) {
      const factor = !edge.link ? 1 : typeof linkCost === 'number' ? linkCost : linkCost(edge.link);
      const length = horizontalDistance(nodes[current], nodes[edge.to]) * factor;
      if (cost[current] + length < cost[edge.to]) {
        cost[edge.to] = cost[current] + length;
        prev[edge.to] = current;
        via[edge.to] = edge.link;
      }
    }
  }

  // Prefer nodes from which the target is directly reachable; otherwise get as close as possible.
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < count; i++) {
    if (cost[i] === Infinity) continue;
    const reachesTarget = isWalkable(map, nodes[i], to);
    const score = cost[i] + horizontalDistance(nodes[i], to) + (reachesTarget ? 0 : 1000);
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  if (best < 0) return { target: from, link: null };

  // Walk the path backwards to find its first node and what comes after it.
  let first = best;
  let second = -1;
  while (prev[first] >= 0) {
    second = first;
    first = prev[first];
  }
  if (second >= 0 && via[second]) return { target: nodes[first], link: via[second] };
  const standingOnFirst = horizontalDistance(from, nodes[first]) < ARRIVE_DISTANCE;
  return { target: nodes[standingOnFirst && second >= 0 ? second : first], link: null };
}
