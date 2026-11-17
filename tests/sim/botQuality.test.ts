/**
 * Does the bot behave sensibly? These tests measure typical "the bot is broken" moments
 * that a player notices: falling into the abyss on its own, standing around, never
 * reaching the player. Each one was a real bug once (see STATUS.md).
 */
import { describe, expect, it } from 'vitest';
import { BotBrain, DEFAULT_PERSONALITY } from '../../src/bots/brain';
import { canStandAt, nearestStandable } from '../../src/bots/nav';
import { directionOf, directionTo, keysFor } from '../../src/bots/steering';
import { Button } from '../../src/shared/input';
import { MAPS } from '../../src/shared/maps';
import { DAECHER } from '../../src/shared/maps/daecher';
import { forwardFromYaw } from '../../src/shared/math/vec3';
import { createPlayer } from '../../src/shared/sim/playerState';
import { stepPlayer } from '../../src/shared/sim/stepPlayer';
import { DIFFICULTIES, type Difficulty } from '../../src/solo/difficulty';
import { expectHealthy, playMatch } from '../soloHelpers';

const LEVELS = Object.keys(DIFFICULTIES) as Difficulty[];
const cases = Object.keys(MAPS).flatMap((mapId) => LEVELS.map((difficulty) => ({ mapId, difficulty })));

describe('bot against a player who just stands there', () => {
  it.each(cases)('$mapId / $difficulty: reaches the player every round, never falls, never stands around', ({ mapId, difficulty }) => {
    for (const seed of [1, 2, 3]) {
      const run = playMatch({ mapId, difficulty, seed, human: 'idle' });
      const b = run.behavior;
      expect(b.botFalls, `seed ${seed}: bot fell into the abyss`).toBe(0);
      expect(b.botKills, `seed ${seed}: every round must end with a sword kill`).toBe(b.rounds);
      // 3 s: the easy bot turns slowly, so lining up for a parkour link takes it up to ~2 s.
      expect(b.longestStandstillSec, `seed ${seed}: bot stood around`).toBeLessThan(3);
      expectHealthy(run);
    }
  });
});

describe('bot against a player who fights back', () => {
  it.each(Object.keys(MAPS))('%s: no standoff - nobody stands around for long (cover between the fighters)', (mapId) => {
    for (const difficulty of ['mittel', 'schwer'] as Difficulty[]) {
      for (const seed of [1, 2, 3, 4]) {
        const run = playMatch({ mapId, difficulty, seed, human: 'fights' });
        expect(run.behavior.longestStandstillSec, `${difficulty}, seed ${seed}`).toBeLessThan(3);
        expect(run.behavior.botFalls, `${difficulty}, seed ${seed}: bot falls`).toBeLessThanOrEqual(1);
        expectHealthy(run);
      }
    }
  });
});

describe('bot brain details', () => {
  it('does not think it is stuck while frozen in the countdown (it used to jump at round start)', () => {
    const map = MAPS.daecher;
    const brain = new BotBrain(1, { ...DEFAULT_PERSONALITY, jumpChance: 0, dashChance: 0 });
    const me = createPlayer(1, map.spawns[1]);
    const enemy = createPlayer(0, map.spawns[0]);
    stepPlayer(me, { seq: 1, moveX: 0, moveZ: 0, yaw: me.yaw, pitch: 0, buttons: 0, viewTick: 0 }, map, 'playing');
    for (let tick = 0; tick < 400; tick++) brain.think(me, enemy, map, false); // a long countdown
    for (let tick = 0; tick < 120; tick++) {
      const sample = brain.think(me, enemy, map, true);
      expect(sample.buttons & Button.Jump, `jumped at tick ${tick} after the countdown`).toBe(0);
      stepPlayer(me, { ...sample, seq: tick + 2, viewTick: 0 }, map, 'playing');
    }
    expect(me.pos.y).toBeGreaterThan(map.killY);
  });

  it('finds the way back from the very edge of a platform', () => {
    // On the rim of roof M nothing counts as "safe to stand" - there must still be a way back.
    const edge = { x: -4.95, y: 0, z: 0 };
    expect(canStandAt(DAECHER, edge.x, edge.z, edge.y)).toBe(false);
    const safe = nearestStandable(DAECHER, edge);
    expect(safe).not.toBeNull();
    expect(canStandAt(DAECHER, safe!.x, safe!.z, safe!.y)).toBe(true);
    expect(nearestStandable(DAECHER, { x: 0, y: 0, z: 40 })).toBeNull(); // far out in the void
  });
});

describe('steering: walking somewhere while looking somewhere else', () => {
  it('picks the keys that move toward the wanted direction for any view direction', () => {
    for (let yaw = -3; yaw <= 3; yaw += 0.37) {
      for (let angle = 0; angle < 6.28; angle += 0.41) {
        const wanted = { x: Math.cos(angle), z: Math.sin(angle) };
        const actual = directionOf(keysFor(wanted, yaw), yaw)!;
        // Keys allow 8 directions, so at most 22.5 degrees off: cos(22.5°) = 0.92.
        expect(actual.x * wanted.x + actual.z * wanted.z).toBeGreaterThan(0.92);
      }
    }
  });

  it('walks forward when looking at the goal and backward when looking away', () => {
    const forward = forwardFromYaw(1.2);
    expect(keysFor(forward, 1.2)).toEqual({ moveX: 0, moveZ: 1 });
    expect(keysFor({ x: -forward.x, z: -forward.z }, 1.2)).toEqual({ moveX: 0, moveZ: -1 });
    expect(keysFor(null, 1.2)).toEqual({ moveX: 0, moveZ: 0 });
    expect(directionTo({ x: 1, z: 1 }, { x: 1, z: 1 })).toBeNull();
    expect(directionTo({ x: 0, z: 0 }, { x: 3, z: 4 })).toEqual({ x: 0.6, z: 0.8 });
  });
});
