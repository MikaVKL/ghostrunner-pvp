import { describe, expect, it } from 'vitest';
import { horizontalDistance } from '../../src/shared/math/vec3';
import { PLAYER_HALF_WIDTH, PLAYER_HEIGHT } from '../../src/shared/physics/collision';
import { PLAYER_MIN_DISTANCE, separatePlayers } from '../../src/shared/physics/playerCollision';
import { stepWorld } from '../../src/shared/sim/stepWorld';
import { Button, hold, playingWorld, runWorld, TEST_CTX, TEST_MAP } from '../helpers';

const YAW_PLUS_X = -Math.PI / 2;
const YAW_MINUS_X = Math.PI / 2;
const YAW_MINUS_Z = 0;

describe('player-vs-player collision', () => {
  it('two players running into each other stop at each other', () => {
    const world = playingWorld();
    const [a, b] = world.players;
    runWorld(world, { 0: hold(a, { yaw: YAW_PLUS_X, moveZ: 1 }), 1: hold(b, { yaw: YAW_MINUS_X, moveZ: 1 }) }, 90);
    expect(a.pos.x).toBeLessThan(b.pos.x); // nobody passed through
    expect(horizontalDistance(a.pos, b.pos)).toBeGreaterThan(PLAYER_MIN_DISTANCE - 0.01);
  });

  it('a player cannot walk through a standing player, it pushes it along', () => {
    const world = playingWorld();
    const [a, b] = world.players;
    const startX = b.pos.x;
    runWorld(world, { 0: hold(a, { yaw: YAW_PLUS_X, moveZ: 1 }), 1: hold(b) }, 60);
    expect(a.pos.x).toBeLessThan(b.pos.x);
    expect(b.pos.x).toBeGreaterThan(startX + 0.5);
  });

  it('a dash goes right through the other player and ends on the far side', () => {
    const world = playingWorld();
    const [a, b] = world.players;
    stepWorld(world, { 0: hold(a, { yaw: YAW_PLUS_X, buttons: Button.Dash }), 1: hold(b) }, TEST_CTX);
    runWorld(world, { 0: hold(a, { yaw: YAW_PLUS_X }), 1: hold(b) }, 20);
    expect(a.pos.x).toBeGreaterThan(b.pos.x);
    expect(horizontalDistance(a.pos, b.pos)).toBeGreaterThan(PLAYER_MIN_DISTANCE - 0.01);
  });

  it('a dash ATTACK does not pass through: it stops at the body (and hits)', () => {
    const world = playingWorld();
    const [a, b] = world.players;
    stepWorld(world, { 0: hold(a, { yaw: YAW_PLUS_X, buttons: Button.Dash | Button.Attack }), 1: hold(b) }, TEST_CTX);
    expect(a.action).toBe('attack');
    expect(a.attackKind).toBe('dash');
    runWorld(world, { 0: hold(a, { yaw: YAW_PLUS_X }), 1: hold(b) }, 4);
    expect(a.pos.x).toBeLessThan(b.pos.x);
  });

  it('nobody is pushed into a wall', () => {
    const world = playingWorld();
    const [a, b] = world.players;
    // b stands with its back against the wall (wall face at z = -5), a pushes from the front.
    b.pos = { x: 0, y: 0, z: -5 + PLAYER_HALF_WIDTH };
    a.pos = { x: 0, y: 0, z: -3 };
    runWorld(world, { 0: hold(a, { yaw: YAW_MINUS_Z, moveZ: 1 }), 1: hold(b) }, 60);
    expect(b.pos.z).toBeGreaterThanOrEqual(-5 + PLAYER_HALF_WIDTH - 1e-6);
    expect(a.pos.z).toBeGreaterThan(b.pos.z + 0.5); // a is held back as well
  });

  it('players at different heights do not collide', () => {
    const world = playingWorld();
    const [a, b] = world.players;
    b.pos = { x: a.pos.x, y: a.pos.y + PLAYER_HEIGHT + 0.5, z: a.pos.z };
    const before = { ...a.pos };
    separatePlayers(world.players, TEST_MAP);
    expect(a.pos).toEqual(before);
  });

  it('separates two players on exactly the same spot without NaN', () => {
    const world = playingWorld();
    const [a, b] = world.players;
    b.pos = { ...a.pos };
    separatePlayers(world.players, TEST_MAP);
    expect(horizontalDistance(a.pos, b.pos)).toBeCloseTo(PLAYER_MIN_DISTANCE, 6);
    expect(Number.isFinite(a.pos.x + b.pos.x + a.pos.z + b.pos.z)).toBe(true);
  });

  it('dead players do not block', () => {
    const world = playingWorld();
    const [a, b] = world.players;
    b.alive = false;
    b.pos = { ...a.pos };
    const before = { ...a.pos };
    separatePlayers(world.players, TEST_MAP);
    expect(a.pos).toEqual(before);
  });

  it('is reported as "disturbed" for both players (their clients could not predict it)', () => {
    const world = playingWorld();
    const [a, b] = world.players;
    const inputs = { 0: hold(a, { yaw: YAW_PLUS_X, moveZ: 1 }), 1: hold(b, { yaw: YAW_MINUS_X, moveZ: 1 }) };
    const results = runWorld(world, inputs, 60);
    const touching = results.filter((r) => r.disturbed.length > 0);
    expect(touching.length).toBeGreaterThan(10);
    expect(touching.at(-1)!.disturbed).toEqual([0, 1]);
  });
});
