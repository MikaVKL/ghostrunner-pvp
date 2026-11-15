import { describe, expect, it } from 'vitest';
import { ALL_BUTTONS, type InputCmd } from '../../src/shared/input';
import { ARENA } from '../../src/shared/maps/arena';
import { FAST_MATCH_CONFIG } from '../../src/shared/match/matchConfig';
import { startMatch } from '../../src/shared/match/lifecycle';
import { createRng } from '../../src/shared/math/rng';
import { clonePlayer, createPlayer } from '../../src/shared/sim/playerState';
import { hashState, listDifferences, stateDifference } from '../../src/shared/sim/stateDiff';
import { stepWorld } from '../../src/shared/sim/stepWorld';
import { addPlayer, createWorld, type SimContext } from '../../src/shared/sim/world';
import { hold, playingWorld, runWorld } from '../helpers';

const ARENA_CTX: SimContext = { map: ARENA, matchConfig: FAST_MATCH_CONFIG };

/** Run a full world for `ticks` ticks with pseudo random inputs; returns the final hash. */
function simulateRandomMatch(seed: number, ticks: number): number {
  const rng = createRng(seed);
  const world = createWorld(ARENA.id);
  addPlayer(world, 0, ARENA);
  addPlayer(world, 1, ARENA);
  startMatch(world, ARENA_CTX);
  const inputs: InputCmd[] = [0, 1].map(() => ({ seq: 0, moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons: 0 }));
  for (let tick = 0; tick < ticks; tick++) {
    for (const cmd of inputs) {
      if (rng() < 0.1) {
        cmd.moveX = Math.floor(rng() * 3) - 1;
        cmd.moveZ = Math.floor(rng() * 3) - 1;
        cmd.yaw = rng() * 6 - 3;
        cmd.buttons = Math.floor(rng() * (ALL_BUTTONS + 1));
      }
    }
    stepWorld(world, { 0: { ...inputs[0] }, 1: { ...inputs[1] } }, ARENA_CTX);
  }
  return hashState(world);
}

describe('determinism', () => {
  it('the same inputs always produce exactly the same world', () => {
    expect(simulateRandomMatch(7, 3000)).toBe(simulateRandomMatch(7, 3000));
    expect(simulateRandomMatch(8, 3000)).toBe(simulateRandomMatch(8, 3000));
  });

  it('different inputs produce a different world', () => {
    expect(simulateRandomMatch(1, 1000)).not.toBe(simulateRandomMatch(2, 1000));
  });

  it('the state survives a JSON round trip unchanged (network safe)', () => {
    const world = playingWorld();
    runWorld(world, { 0: hold(world.players[0], { moveZ: 1, moveX: 1 }) }, 37);
    const copy = JSON.parse(JSON.stringify(world));
    expect(stateDifference(world, copy)).toBe(0);
    expect(hashState(copy)).toBe(hashState(world));
  });
});

describe('disturbed detection', () => {
  it('reports nobody while players just move', () => {
    const world = playingWorld();
    const [a, b] = world.players;
    const results = runWorld(world, { 0: hold(a, { moveX: 1 }), 1: hold(b, { moveX: 1 }) }, 30);
    expect(results.every((r) => r.disturbed.length === 0)).toBe(true);
  });

  it('reports everybody when the phase changes', () => {
    const world = playingWorld();
    world.players[0].hp = 0;
    expect(stepWorld(world, {}, { map: ARENA, matchConfig: FAST_MATCH_CONFIG }).disturbed).toEqual([0, 1]);
  });
});

describe('state diff helpers', () => {
  it('stateDifference is 0 for clones and reports the largest numeric gap', () => {
    const a = createPlayer(0, ARENA.spawns[0]);
    const b = clonePlayer(a);
    expect(stateDifference(a, b)).toBe(0);
    b.pos.x += 0.25;
    b.vel.y += 0.1;
    expect(stateDifference(a, b)).toBeCloseTo(0.25);
  });

  it('non-numeric differences count as infinite', () => {
    const a = createPlayer(0, ARENA.spawns[0]);
    const b = clonePlayer(a);
    b.action = 'attack';
    expect(stateDifference(a, b)).toBe(Infinity);
  });

  it('listDifferences names the fields that differ', () => {
    const a = createPlayer(0, ARENA.spawns[0]);
    const b = clonePlayer(a);
    b.vel.y = 3;
    b.grounded = true;
    const diffs = listDifferences(a, b);
    expect(diffs).toHaveLength(2);
    expect(diffs.join('|')).toContain('vel.y');
    expect(diffs.join('|')).toContain('grounded');
  });

  it('clonePlayer makes a deep copy', () => {
    const a = createPlayer(0, ARENA.spawns[0]);
    const b = clonePlayer(a);
    b.pos.x = 99;
    expect(a.pos.x).not.toBe(99);
  });
});
