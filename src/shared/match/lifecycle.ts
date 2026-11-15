/**
 * Starting and resetting matches and rounds. Called by the match rules (stepMatch.ts)
 * and by the server room when players join or leave.
 */
import type { GameEvent } from '../sim/events';
import { resetPlayer } from '../sim/playerState';
import type { SimContext, WorldState } from '../sim/world';

function respawnAll(world: WorldState, ctx: SimContext): void {
  for (const player of world.players) resetPlayer(player, ctx.map.spawns[player.slot]);
}

/** Put everyone on their spawn and begin the countdown for the next round. */
export function startRound(world: WorldState, ctx: SimContext, round: number): void {
  respawnAll(world, ctx);
  world.match.phase = 'countdown';
  world.match.phaseTicksLeft = ctx.matchConfig.countdownTicks;
  world.match.round = round;
  world.match.roundWinner = -1;
}

/** Reset the scores and begin round 1. Called when the second player joins. */
export function startMatch(world: WorldState, ctx: SimContext): void {
  world.match.scores = [0, 0];
  world.match.matchWinner = -1;
  world.match.rematchVotes = [false, false];
  startRound(world, ctx, 1);
}

/** A player asks for a rematch. Only counts after the match has ended. Returns true if noted. */
export function voteRematch(world: WorldState, slot: number): boolean {
  if (world.match.phase !== 'matchEnd' || world.match.rematchVotes[slot] !== false) return false;
  world.match.rematchVotes[slot] = true;
  return true;
}

/** Go back to free practice mode. Called when a player leaves. */
export function enterWaiting(world: WorldState, ctx: SimContext): void {
  respawnAll(world, ctx);
  world.match.phase = 'waiting';
  world.match.phaseTicksLeft = 0;
  world.match.round = 0;
  world.match.scores = [0, 0];
  world.match.roundWinner = -1;
  world.match.matchWinner = -1;
  world.match.rematchVotes = [false, false];
}

/** End the current round with the given winner slot (-1 = draw). */
export function endRound(
  world: WorldState,
  ctx: SimContext,
  winner: number,
  events: GameEvent[],
): void {
  const match = world.match;
  if (winner >= 0) match.scores[winner]++;
  match.roundWinner = winner;
  match.phase = 'roundEnd';
  match.phaseTicksLeft = ctx.matchConfig.roundEndTicks;
  events.push({ type: 'roundEnd', round: match.round, winner });
}
