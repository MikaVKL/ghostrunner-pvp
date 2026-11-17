/**
 * Starting and resetting matches and rounds. Called by the match rules (stepMatch.ts)
 * and by the server room when players join or leave.
 */
import type { GameEvent } from '../sim/events';
import { resetPlayer } from '../sim/playerState';
import type { SimContext, WorldState } from '../sim/world';

function respawnAll(world: WorldState, ctx: SimContext): void {
  for (const player of world.players) resetPlayer(player, ctx.map.spawns[player.slot], ctx.mode.lives);
  // Everyone teleported: old positions and undecided hits are meaningless now.
  world.history = [];
  world.pendingHits = [];
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

/**
 * Freeze the match because a player lost its connection. `ticks` is shown as a countdown
 * (the room removes the player when it runs out). Does nothing in practice mode.
 */
export function pauseMatch(world: WorldState, ticks: number): void {
  const match = world.match;
  if (match.phase === 'waiting' || match.phase === 'paused') return;
  match.resumePhase = match.phase;
  match.resumeTicksLeft = match.phaseTicksLeft;
  match.phase = 'paused';
  match.phaseTicksLeft = ticks;
}

/**
 * Continue after a pause. An interrupted round is replayed from its countdown (fair for
 * the player who was away); pauses between rounds simply continue.
 */
export function resumeMatch(world: WorldState, ctx: SimContext): void {
  const match = world.match;
  if (match.phase !== 'paused') return;
  if (match.resumePhase === 'countdown' || match.resumePhase === 'playing') {
    startRound(world, ctx, match.round);
    return;
  }
  match.phase = match.resumePhase;
  match.phaseTicksLeft = match.resumeTicksLeft;
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
