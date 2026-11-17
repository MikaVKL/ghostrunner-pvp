import { describe, expect, it } from 'vitest';
import { enterWaiting, startMatch, voteRematch } from '../../src/shared/match/lifecycle';
import { DEFAULT_MATCH_CONFIG } from '../../src/shared/match/matchConfig';
import type { GameEvent } from '../../src/shared/sim/events';
import { DUEL } from '../../src/shared/match/gameModes';
import { stepWorld } from '../../src/shared/sim/stepWorld';
import { addPlayer, createWorld, type SimContext, type WorldState } from '../../src/shared/sim/world';
import { playingWorld, runWorld, TEST_CTX, TEST_MAP } from '../helpers';

const cfg = TEST_CTX.matchConfig;

/** Step until the phase changes (or fail after `limit` ticks). Returns the events seen. */
function runUntilPhaseChange(world: WorldState, limit = 5000): GameEvent[] {
  const start = world.match.phase;
  const events: GameEvent[] = [];
  for (let i = 0; i < limit && world.match.phase === start; i++) {
    events.push(...stepWorld(world, {}, TEST_CTX).events);
  }
  expect(world.match.phase).not.toBe(start);
  return events;
}

describe('match flow', () => {
  it('a single player waits in practice mode and respawns after falling', () => {
    const world = createWorld(TEST_MAP.id);
    const p = addPlayer(world, 0, TEST_CTX);
    expect(world.match.phase).toBe('waiting');
    p.pos.y = TEST_MAP.killY - 1;
    stepWorld(world, {}, TEST_CTX);
    expect(p.alive).toBe(true);
    expect(p.pos.y).toBeGreaterThanOrEqual(0);
  });

  it('starts with a countdown in which players are frozen at their spawns', () => {
    const world = createWorld(TEST_MAP.id);
    addPlayer(world, 0, TEST_CTX);
    addPlayer(world, 1, TEST_CTX);
    startMatch(world, TEST_CTX);
    expect(world.match.phase).toBe('countdown');
    const events = runWorld(world, {}, cfg.countdownTicks).flatMap((r) => r.events);
    expect(world.match.phase).toBe('playing');
    expect(events).toContainEqual({ type: 'roundStart', round: 1 });
    expect(world.players[0].pos).toEqual(TEST_MAP.spawns[0].pos);
  });

  it('a kill ends the round and scores for the survivor', () => {
    const world = playingWorld();
    world.players[1].hp = 0;
    const events = stepWorld(world, {}, TEST_CTX).events;
    expect(world.match.phase).toBe('roundEnd');
    expect(world.match.scores).toEqual([1, 0]);
    expect(world.players[1].alive).toBe(false);
    expect(events).toContainEqual({ type: 'death', slot: 1, cause: 'hp' });
    expect(events).toContainEqual({ type: 'roundEnd', round: 1, winner: 0 });
  });

  it('falling out of the map kills (fall death)', () => {
    const world = playingWorld();
    world.players[0].pos.y = TEST_MAP.killY - 1;
    const events = stepWorld(world, {}, TEST_CTX).events;
    expect(events).toContainEqual({ type: 'death', slot: 0, cause: 'fall' });
    expect(world.match.scores).toEqual([0, 1]);
  });

  it('a double kill is a draw', () => {
    const world = playingWorld();
    world.players[0].hp = 0;
    world.players[1].hp = 0;
    stepWorld(world, {}, TEST_CTX);
    expect(world.match.scores).toEqual([0, 0]);
    expect(world.match.roundWinner).toBe(-1);
  });

  it('when the round time runs out, the player with more HP wins', () => {
    const world = playingWorld();
    world.players[0].hp = 2; // more lives than player 1
    runUntilPhaseChange(world);
    expect(world.match.phase).toBe('roundEnd');
    expect(world.match.roundWinner).toBe(0);
  });

  it('the next round respawns both players with full HP', () => {
    const world = playingWorld();
    world.players[1].hp = 0;
    stepWorld(world, {}, TEST_CTX);
    runUntilPhaseChange(world); // roundEnd -> countdown
    expect(world.match.phase).toBe('countdown');
    expect(world.match.round).toBe(2);
    expect(world.players[1].alive).toBe(true);
    expect(world.players[1].hp).toBe(DUEL.lives);
  });

  it('the match ends when a player reaches roundsToWin, then restarts', () => {
    const world = playingWorld();
    for (let round = 0; round < cfg.roundsToWin; round++) {
      while (world.match.phase !== 'playing') stepWorld(world, {}, TEST_CTX);
      world.players[1].hp = 0;
      stepWorld(world, {}, TEST_CTX);
    }
    const events = runUntilPhaseChange(world); // roundEnd -> matchEnd
    expect(world.match.phase).toBe('matchEnd');
    expect(world.match.matchWinner).toBe(0);
    expect(events).toContainEqual({ type: 'matchEnd', winner: 0 });

    runUntilPhaseChange(world); // matchEnd -> countdown of a new match
    expect(world.match.phase).toBe('countdown');
    expect(world.match.scores).toEqual([0, 0]);
    expect(world.match.round).toBe(1);
  });

  it('the match ends in a draw after maxRounds drawn rounds', () => {
    const world = playingWorld();
    for (let i = 0; i < 100_000 && world.match.phase !== 'matchEnd'; i++) {
      if (world.match.phase === 'playing') {
        world.players[0].hp = 0;
        world.players[1].hp = 0;
      }
      stepWorld(world, {}, TEST_CTX);
    }
    expect(world.match.phase).toBe('matchEnd');
    expect(world.match.round).toBe(cfg.maxRounds);
    expect(world.match.matchWinner).toBe(-1);
  });

  it('enterWaiting resets everything when a player leaves', () => {
    const world = playingWorld();
    world.match.scores = [2, 1];
    enterWaiting(world, TEST_CTX);
    expect(world.match.phase).toBe('waiting');
    expect(world.match.scores).toEqual([0, 0]);
  });
});

describe('best-of-5 and rematch', () => {
  /** Fast timers, but the real rules: first to 3 wins, rematch only by vote. */
  const BO5_CTX: SimContext = {
    map: TEST_MAP,
    mode: DUEL,
    matchConfig: { ...cfg, roundsToWin: DEFAULT_MATCH_CONFIG.roundsToWin, maxRounds: DEFAULT_MATCH_CONFIG.maxRounds, matchEndTicks: 0 },
  };

  /** Plays rounds; `losers[i]` is the slot that dies in round i+1. Stops at matchEnd. */
  function playRounds(world: WorldState, losers: number[]): void {
    for (const loser of losers) {
      for (let i = 0; i < 5000 && world.match.phase !== 'playing'; i++) stepWorld(world, {}, BO5_CTX);
      world.players[loser].hp = 0;
      stepWorld(world, {}, BO5_CTX);
    }
    for (let i = 0; i < 5000 && world.match.phase === 'roundEnd'; i++) stepWorld(world, {}, BO5_CTX);
  }

  it('the default rules are best-of-5: first to 3 round wins', () => {
    expect(DEFAULT_MATCH_CONFIG.roundsToWin).toBe(3);
    expect(DEFAULT_MATCH_CONFIG.maxRounds).toBeGreaterThanOrEqual(5);
  });

  it('a 3:2 match needs all five rounds', () => {
    const world = playingWorld(BO5_CTX);
    playRounds(world, [1, 0, 1, 0]); // 2:2
    expect(world.match.phase).toBe('countdown');
    expect(world.match.scores).toEqual([2, 2]);
    playRounds(world, [1]);
    expect(world.match.phase).toBe('matchEnd');
    expect(world.match.scores).toEqual([3, 2]);
    expect(world.match.matchWinner).toBe(0);
    expect(world.match.round).toBe(5);
  });

  it('a 3:0 match ends after three rounds', () => {
    const world = playingWorld(BO5_CTX);
    playRounds(world, [0, 0, 0]);
    expect(world.match.phase).toBe('matchEnd');
    expect(world.match.matchWinner).toBe(1);
    expect(world.match.round).toBe(3);
  });

  it('after the match nothing happens until BOTH players vote for a rematch', () => {
    const world = playingWorld(BO5_CTX);
    playRounds(world, [1, 1, 1]);
    runWorld(world, {}, 600, BO5_CTX);
    expect(world.match.phase).toBe('matchEnd');

    expect(voteRematch(world, 0)).toBe(true);
    expect(voteRematch(world, 0)).toBe(false); // voting twice changes nothing
    runWorld(world, {}, 60, BO5_CTX);
    expect(world.match.phase).toBe('matchEnd');
    expect(world.match.rematchVotes).toEqual([true, false]);

    voteRematch(world, 1);
    stepWorld(world, {}, BO5_CTX);
    expect(world.match.phase).toBe('countdown');
    expect(world.match.round).toBe(1);
    expect(world.match.scores).toEqual([0, 0]);
    expect(world.match.rematchVotes).toEqual([false, false]);
  });

  it('a rematch vote during a running match is ignored', () => {
    const world = playingWorld(BO5_CTX);
    expect(voteRematch(world, 0)).toBe(false);
    expect(world.match.rematchVotes).toEqual([false, false]);
  });
});
