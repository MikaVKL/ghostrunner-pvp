/**
 * The complete game state of one room: all players plus the match state.
 * Like PlayerState this is plain JSON data and is sent to clients as-is.
 */
import type { MapDef } from '../maps/mapTypes';
import type { MatchConfig } from '../match/matchConfig';
import { createPlayer, type PlayerState } from './playerState';

/**
 * waiting   - fewer than 2 players; free movement, no combat (practice while waiting)
 * countdown - both players frozen at their spawns
 * playing   - the round is running
 * roundEnd  - someone won the round; everyone frozen
 * matchEnd  - someone won the match; everyone frozen until both players vote for a rematch
 */
export type MatchPhase = 'waiting' | 'countdown' | 'playing' | 'roundEnd' | 'matchEnd';

export interface MatchState {
  phase: MatchPhase;
  /** Ticks until the current phase ends (unused in 'waiting'). */
  phaseTicksLeft: number;
  round: number;
  /** Round wins, indexed by player slot. */
  scores: number[];
  /** Slot that won the last round, or -1 for none/draw. */
  roundWinner: number;
  /** Slot that won the match, or -1 for none/draw. */
  matchWinner: number;
  /** After the match: which slots asked for a rematch. Both true => a new match starts. */
  rematchVotes: boolean[];
}

export interface WorldState {
  /** Number of simulation steps since the room was created. */
  tick: number;
  mapId: string;
  players: PlayerState[];
  match: MatchState;
}

/** Static data the simulation needs but that never changes during a match. */
export interface SimContext {
  map: MapDef;
  matchConfig: MatchConfig;
}

export function createWorld(mapId: string): WorldState {
  return {
    tick: 0,
    mapId,
    players: [],
    match: {
      phase: 'waiting',
      phaseTicksLeft: 0,
      round: 0,
      scores: [0, 0],
      roundWinner: -1,
      matchWinner: -1,
      rematchVotes: [false, false],
    },
  };
}

export function getPlayer(world: WorldState, slot: number): PlayerState | undefined {
  return world.players.find((p) => p.slot === slot);
}

export function addPlayer(world: WorldState, slot: number, map: MapDef): PlayerState {
  const player = createPlayer(slot, map.spawns[slot]);
  world.players.push(player);
  world.players.sort((a, b) => a.slot - b.slot);
  return player;
}

export function removePlayer(world: WorldState, slot: number): void {
  world.players = world.players.filter((p) => p.slot !== slot);
}

/** In which phases players are simulated (otherwise they are frozen in place). */
export function phaseAllowsAction(phase: MatchPhase): boolean {
  return phase === 'waiting' || phase === 'playing';
}
