/**
 * Checks every registered map: spawns, nav points, a safe walking route between the
 * spawns, and that every parkour link can really be taken (a simulated player runs,
 * jumps and wall-runs it with the same code the bots use).
 */
import { describe, expect, it } from 'vitest';
import { BotBrain, DEFAULT_PERSONALITY } from '../../src/bots/brain';
import { canStandAt, planRoute } from '../../src/bots/nav';
import { LinkRunner } from '../../src/bots/parkour';
import { Button, type InputCmd } from '../../src/shared/input';
import { DEFAULT_MAP_ID, MAP_ROTATION, MAPS } from '../../src/shared/maps';
import type { MapDef, ParkourLink } from '../../src/shared/maps/mapTypes';
import { angleDifference, clamp } from '../../src/shared/math/scalar';
import { horizontalDistance, yawToward } from '../../src/shared/math/vec3';
import { createPlayer, type PlayerState } from '../../src/shared/sim/playerState';
import { stepPlayer } from '../../src/shared/sim/stepPlayer';

const maps = Object.values(MAPS);

function playerAt(map: MapDef, x: number, y: number, z: number, yaw: number): PlayerState {
  const p = createPlayer(0, { pos: { x, y, z }, yaw });
  stepPlayer(p, { seq: 1, moveX: 0, moveZ: 0, yaw, pitch: 0, buttons: 0, viewTick: 0 }, map, 'playing');
  return p;
}

/** Runs one parkour link with the bots' LinkRunner. Returns the player after landing. */
function runLink(map: MapDef, link: ParkourLink, wallJump: boolean): { p: PlayerState; wallRan: boolean } {
  const p = playerAt(map, link.from.x, link.from.y, link.from.z, yawToward(link.from, link.to) + 1);
  const runner = new LinkRunner(link);
  let yaw = p.yaw;
  let wallRan = false;
  for (let tick = 0; tick < 600; tick++) {
    const out = runner.step(p, map, yaw, wallJump);
    if (out.done) break;
    yaw += clamp(angleDifference(yaw, out.yaw), -0.2, 0.2);
    const cmd: InputCmd = { seq: tick + 2, moveX: out.moveX, moveZ: out.moveZ, yaw, pitch: 0, buttons: out.jump ? Button.Jump : 0, viewTick: 0 };
    stepPlayer(p, cmd, map, 'playing');
    wallRan ||= p.wallRunning;
  }
  return { p, wallRan };
}

describe('map registry', () => {
  it('has the three parkour maps in the rotation and a valid default', () => {
    expect(MAP_ROTATION).toHaveLength(3);
    for (const id of MAP_ROTATION) expect(MAPS[id]).toBeDefined();
    expect(MAPS[DEFAULT_MAP_ID]).toBeDefined();
    expect(new Set(maps.map((m) => m.id)).size).toBe(maps.length);
  });
});

describe.each(maps)('map "$id"', (map) => {
  it('has a name, a description and two spawns that stand on solid ground', () => {
    expect(map.name.length).toBeGreaterThan(0);
    expect(map.description.length).toBeGreaterThan(0);
    expect(map.spawns).toHaveLength(2);
    for (const spawn of map.spawns) {
      const p = playerAt(map, spawn.pos.x, spawn.pos.y, spawn.pos.z, spawn.yaw);
      expect(p.grounded).toBe(true);
      expect(p.pos.y).toBeCloseTo(spawn.pos.y, 6);
      expect(spawn.pos.y).toBeGreaterThan(map.killY + 5);
    }
  });

  it('spawns look toward each other and are far apart', () => {
    const [a, b] = map.spawns;
    expect(Math.abs(angleDifference(a.yaw, yawToward(a.pos, b.pos)))).toBeLessThan(0.3);
    expect(Math.abs(angleDifference(b.yaw, yawToward(b.pos, a.pos)))).toBeLessThan(0.3);
    expect(horizontalDistance(a.pos, b.pos)).toBeGreaterThan(15);
  });

  it('has an abyss: a good part of the map area has no floor', () => {
    // Sample the rectangle around all floors of the map.
    const floors = map.boxes.filter((box) => box.max.y <= 4.1 && box.max.y - box.min.y < 30);
    const minX = Math.min(...floors.map((b) => b.min.x));
    const maxX = Math.max(...floors.map((b) => b.max.x));
    const minZ = Math.min(...floors.map((b) => b.min.z));
    const maxZ = Math.max(...floors.map((b) => b.max.z));
    let total = 0;
    let voidPoints = 0;
    for (let x = minX; x <= maxX; x += 0.5) {
      for (let z = minZ; z <= maxZ; z += 0.5) {
        total++;
        const covered = map.boxes.some((box) => x >= box.min.x && x <= box.max.x && z >= box.min.z && z <= box.max.z);
        if (!covered) voidPoints++;
      }
    }
    expect(voidPoints / total).toBeGreaterThan(0.1);
  });

  it('falling into a lower area is never deadly by itself: every floor below 0 has walls or floor around it', () => {
    // Regression (Reaktor): a gap between a sunken floor and the floor around it killed players
    // who were knocked off a wall-run. Every point next to a sunken floor must be covered.
    for (const box of map.boxes.filter((b) => b.max.y < -0.5 && b.max.y > map.killY)) {
      for (const [x, z] of [[box.min.x - 0.3, (box.min.z + box.max.z) / 2], [box.max.x + 0.3, (box.min.z + box.max.z) / 2], [(box.min.x + box.max.x) / 2, box.min.z - 0.3], [(box.min.x + box.max.x) / 2, box.max.z + 0.3]]) {
        const covered = map.boxes.some((b) => x >= b.min.x && x <= b.max.x && z >= b.min.z && z <= b.max.z && b.min.y <= box.max.y);
        expect(covered, `gap next to the sunken floor at x=${x}, z=${z}`).toBe(true);
      }
    }
  });

  it('nav points and link ends are places where a player can stand', () => {
    const points = [...map.navPoints, ...map.links.flatMap((l) => [l.from, l.to])];
    for (const p of points) expect(canStandAt(map, p.x, p.z, p.y), JSON.stringify(p)).toBe(true);
  });

  it('has a safe walking route between the spawns (no parkour needed)', () => {
    for (const [start, goal] of [[0, 1], [1, 0]]) {
      let pos = map.spawns[start].pos;
      for (let hop = 0; hop < 30 && horizontalDistance(pos, map.spawns[goal].pos) > 0.01; hop++) {
        const step = planRoute(map, pos, map.spawns[goal].pos, Infinity);
        expect(step.link).toBeNull();
        expect(horizontalDistance(step.target, pos), `stuck at ${JSON.stringify(pos)}`).toBeGreaterThan(0.01);
        pos = step.target;
      }
      expect(horizontalDistance(pos, map.spawns[goal].pos)).toBeLessThan(0.01);
    }
  });

  it('has walls for wall-running (at least two wall-run links)', () => {
    expect(map.links.filter((l) => l.kind === 'wallRun').length).toBeGreaterThanOrEqual(2);
  });

  it.each(map.links.map((link, i) => ({ i, link, kind: link.kind })))('link $i ($kind) can be taken', ({ link }) => {
    for (const wallJump of [false, true]) {
      const { p, wallRan } = runLink(map, link, wallJump);
      expect(p.grounded, `not landed, pos ${JSON.stringify(p.pos)}`).toBe(true);
      expect(p.pos.y).toBeCloseTo(link.to.y, 3);
      // Landed on the far side: at least as far as the landing point (minus a small margin).
      const length = horizontalDistance(link.from, link.to);
      const progress = ((p.pos.x - link.from.x) * (link.to.x - link.from.x) + (p.pos.z - link.from.z) * (link.to.z - link.from.z)) / length;
      expect(progress).toBeGreaterThan(length - 1.6);
      if (link.kind === 'wallRun') expect(wallRan).toBe(true);
      if (link.kind === 'jump') expect(horizontalDistance(p.pos, link.to)).toBeLessThan(1.5);
    }
  });

  it.each([
    { name: 'parkour-loving', linkCost: 0.3 },
    { name: 'default', linkCost: DEFAULT_PERSONALITY.linkCost },
    { name: 'walking-only', linkCost: Infinity },
  ])('a $name bot reaches the other spawn without falling', ({ linkCost }) => {
    for (const [start, goal] of [[0, 1], [1, 0]]) {
      const brain = new BotBrain(7, { ...DEFAULT_PERSONALITY, linkCost, jumpChance: 0, dashChance: 0, attackChance: 0, dashAttackChance: 0 });
      const spawn = map.spawns[start];
      const me = playerAt(map, spawn.pos.x, spawn.pos.y, spawn.pos.z, spawn.yaw);
      const enemy = playerAt(map, map.spawns[goal].pos.x, map.spawns[goal].pos.y, map.spawns[goal].pos.z, 0);
      enemy.slot = 1;
      let arrived = false;
      for (let tick = 0; tick < 60 * 40 && !arrived; tick++) {
        const sample = brain.think(me, enemy, map);
        stepPlayer(me, { ...sample, seq: tick + 2, viewTick: 0 }, map, 'playing');
        expect(me.pos.y, `fell at tick ${tick}`).toBeGreaterThan(map.killY);
        arrived = horizontalDistance(me.pos, enemy.pos) < 2.5;
      }
      expect(arrived, `stopped at ${JSON.stringify(me.pos)}`).toBe(true);
    }
  });
});
