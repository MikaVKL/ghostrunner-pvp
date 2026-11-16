/**
 * Shared helpers for tests: a simple test map and small functions to run the simulation.
 */
import { Button, type InputCmd, type InputSample } from '../src/shared/input';
import { boxFromBounds, type MapDef } from '../src/shared/maps/mapTypes';
import { FAST_MATCH_CONFIG } from '../src/shared/match/matchConfig';
import { startMatch } from '../src/shared/match/lifecycle';
import { createPlayer, type PlayerState } from '../src/shared/sim/playerState';
import { stepPlayer } from '../src/shared/sim/stepPlayer';
import { stepWorld, type InputsBySlot, type StepResult } from '../src/shared/sim/stepWorld';
import { addPlayer, createWorld, type SimContext, type WorldState } from '../src/shared/sim/world';

export { Button };

/**
 * Test map: a 40 x 40 m floor (top at y = 0) and one tall wall along z = -5
 * (its face at z = -5 looks toward +Z). Spawns face each other 2 m apart.
 */
export const TEST_MAP: MapDef = {
  id: 'test',
  name: 'Test',
  description: 'Flat floor with one wall.',
  killY: -10,
  boxes: [
    boxFromBounds(-20, 20, -1, 0, -20, 20), // floor
    boxFromBounds(-20, 20, 0, 8, -6, -5), // wall
  ],
  spawns: [
    { pos: { x: -1, y: 0, z: 5 }, yaw: -Math.PI / 2 }, // looks toward +X
    { pos: { x: 1, y: 0, z: 5 }, yaw: Math.PI / 2 }, // looks toward -X
  ],
  navPoints: [],
  links: [],
};

export const TEST_CTX: SimContext = { map: TEST_MAP, matchConfig: FAST_MATCH_CONFIG };

/** Build an input command. Unspecified fields are neutral. */
export function input(partial: Partial<InputCmd> = {}, seq = 1): InputCmd {
  return { seq, moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons: 0, viewTick: 0, ...partial };
}

/** A player standing on the floor of the test map (already grounded). */
export function standingPlayer(x = 0, z = 0, yaw = 0): PlayerState {
  const p = createPlayer(0, { pos: { x, y: 0, z }, yaw });
  stepPlayer(p, input({ yaw }), TEST_MAP, 'playing'); // one tick so `grounded` is set
  return p;
}

/** Simulate one player for `ticks` ticks with the same input. */
export function runPlayer(p: PlayerState, partial: Partial<InputSample>, ticks: number): void {
  for (let i = 0; i < ticks; i++) stepPlayer(p, input({ yaw: p.yaw, ...partial }), TEST_MAP, 'playing');
}

/** A world with two players that is already in the 'playing' phase. */
export function playingWorld(ctx: SimContext = TEST_CTX): WorldState {
  const world = createWorld(ctx.map.id);
  // Tests always use the sword, even if the default weapon is changed later.
  addPlayer(world, 0, ctx.map).weaponId = 'sword';
  addPlayer(world, 1, ctx.map).weaponId = 'sword';
  startMatch(world, ctx);
  while (world.match.phase !== 'playing') stepWorld(world, {}, ctx);
  stepWorld(world, {}, ctx); // let both players land
  return world;
}

/** Step the world `ticks` times with the given inputs; returns all results. */
export function runWorld(
  world: WorldState,
  inputs: InputsBySlot,
  ticks: number,
  ctx: SimContext = TEST_CTX,
): StepResult[] {
  const results: StepResult[] = [];
  for (let i = 0; i < ticks; i++) results.push(stepWorld(world, inputs, ctx));
  return results;
}

/** Input that keeps a player looking the way it currently looks. */
export function hold(p: PlayerState, partial: Partial<InputCmd> = {}): InputCmd {
  return input({ yaw: p.yaw, pitch: p.pitch, ...partial });
}
