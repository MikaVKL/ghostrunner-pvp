/**
 * One tick of the whole world. Only the SERVER calls this (tests and bots too).
 *
 * Order inside a tick:
 *   1. every player moves/acts from its own input   (predictable by its client)
 *   2. combat between players is resolved            (NOT predictable)
 *   3. match rules run: deaths, scores, phase changes (NOT predictable)
 *
 * Steps 2 and 3 are "interactions". We detect which players they changed and report
 * them as `disturbed`, so each client knows whether a prediction error was expected.
 */
import { resolveCombat } from '../combat/resolveCombat';
import { neutralInput, type InputCmd } from '../input';
import { stepMatch } from '../match/stepMatch';
import type { GameEvent } from './events';
import { clonePlayer } from './playerState';
import { stateDifference } from './stateDiff';
import { stepPlayer } from './stepPlayer';
import type { SimContext, WorldState } from './world';

/** Inputs for this tick, keyed by player slot. Missing slots get a neutral input. */
export type InputsBySlot = Record<number, InputCmd | undefined>;

export interface StepResult {
  events: GameEvent[];
  /** Slots whose state was changed by something their client could not predict. */
  disturbed: number[];
}

export function stepWorld(world: WorldState, inputs: InputsBySlot, ctx: SimContext): StepResult {
  const events: GameEvent[] = [];
  const phaseBefore = world.match.phase;
  world.tick++;

  // 1. Predictable part.
  for (const player of world.players) {
    const input = inputs[player.slot] ?? neutralInput(player.yaw, player.pitch);
    stepPlayer(player, input, ctx.map, phaseBefore);
  }
  const predicted = world.players.map(clonePlayer);

  // 2. + 3. Interactions.
  if (phaseBefore === 'playing') resolveCombat(world.players, events);
  stepMatch(world, ctx, events);

  const phaseChanged = world.match.phase !== phaseBefore;
  const disturbed: number[] = [];
  world.players.forEach((player, i) => {
    if (phaseChanged || stateDifference(predicted[i], player) !== 0) disturbed.push(player.slot);
  });
  return { events, disturbed };
}
