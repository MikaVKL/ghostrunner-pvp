/**
 * Match rules: deaths, round wins, timers, phase changes. Runs once per tick after
 * movement and combat. Server-authoritative (the client just receives the result).
 */
import type { GameEvent } from '../sim/events';
import { resetPlayer, type PlayerState } from '../sim/playerState';
import type { SimContext, WorldState } from '../sim/world';
import { assertNever } from '../util/assertNever';
import { endRound, startMatch, startRound } from './lifecycle';

/** Mark players as dead if they ran out of HP or fell out of the map. Returns true if any died. */
function applyDeaths(world: WorldState, ctx: SimContext, events: GameEvent[]): boolean {
  let anyDied = false;
  for (const p of world.players) {
    if (!p.alive) continue;
    const fell = p.pos.y < ctx.map.killY;
    if (p.hp > 0 && !fell) continue;
    p.alive = false;
    p.hp = 0;
    anyDied = true;
    events.push({ type: 'death', slot: p.slot, cause: fell ? 'fall' : 'hp' });
  }
  return anyDied;
}

/** Slot of the single survivor, or -1 if nobody or more than one player is alive. */
function soleSurvivor(players: PlayerState[]): number {
  const alive = players.filter((p) => p.alive);
  return alive.length === 1 ? alive[0].slot : -1;
}

/** Slot of the player with the most HP, or -1 on a tie. */
function healthLeader(players: PlayerState[]): number {
  const sorted = [...players].sort((a, b) => b.hp - a.hp);
  if (sorted.length < 2 || sorted[0].hp === sorted[1].hp) return -1;
  return sorted[0].slot;
}

function stepPlaying(world: WorldState, ctx: SimContext, events: GameEvent[]): void {
  if (applyDeaths(world, ctx, events)) {
    endRound(world, ctx, soleSurvivor(world.players), events);
    return;
  }
  world.match.phaseTicksLeft--;
  if (world.match.phaseTicksLeft <= 0) endRound(world, ctx, healthLeader(world.players), events);
}

function stepRoundEnd(world: WorldState, ctx: SimContext, events: GameEvent[]): void {
  const match = world.match;
  const { roundsToWin, maxRounds, matchEndTicks } = ctx.matchConfig;
  const matchOver = match.scores.some((s) => s >= roundsToWin) || match.round >= maxRounds;
  if (!matchOver) {
    startRound(world, ctx, match.round + 1);
    return;
  }
  const [a, b] = match.scores;
  match.matchWinner = a === b ? -1 : a > b ? 0 : 1;
  match.phase = 'matchEnd';
  match.phaseTicksLeft = matchEndTicks;
  events.push({ type: 'matchEnd', winner: match.matchWinner });
}

/** In practice mode a fall just puts the player back on the spawn. */
function stepWaiting(world: WorldState, ctx: SimContext): void {
  for (const p of world.players) {
    if (p.pos.y < ctx.map.killY) resetPlayer(p, ctx.map.spawns[p.slot]);
  }
}

export function stepMatch(world: WorldState, ctx: SimContext, events: GameEvent[]): void {
  const match = world.match;
  switch (match.phase) {
    case 'waiting':
      stepWaiting(world, ctx);
      return;
    case 'countdown':
      match.phaseTicksLeft--;
      if (match.phaseTicksLeft <= 0) {
        match.phase = 'playing';
        match.phaseTicksLeft = ctx.matchConfig.roundTicks;
        events.push({ type: 'roundStart', round: match.round });
      }
      return;
    case 'playing':
      stepPlaying(world, ctx, events);
      return;
    case 'roundEnd':
      match.phaseTicksLeft--;
      if (match.phaseTicksLeft <= 0) stepRoundEnd(world, ctx, events);
      return;
    case 'matchEnd':
      match.phaseTicksLeft--;
      if (match.phaseTicksLeft <= 0) startMatch(world, ctx);
      return;
    default:
      assertNever(match.phase);
  }
}
