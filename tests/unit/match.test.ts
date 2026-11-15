import { describe, expect, it } from 'vitest';
import { enterWaiting, startMatch } from '../../src/shared/match/lifecycle';
import type { GameEvent } from '../../src/shared/sim/events';
import { MAX_HP } from '../../src/shared/sim/playerState';
import { stepWorld } from '../../src/shared/sim/stepWorld';
import { addPlayer, createWorld, type WorldState } from '../../src/shared/sim/world';
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
    const p = addPlayer(world, 0, TEST_MAP);
    expect(world.match.phase).toBe('waiting');
    p.pos.y = TEST_MAP.killY - 1;
    stepWorld(world, {}, TEST_CTX);
    expect(p.alive).toBe(true);
    expect(p.pos.y).toBeGreaterThanOrEqual(0);
  });

  it('starts with a countdown in which players are frozen at their spawns', () => {
    const world = createWorld(TEST_MAP.id);
    addPlayer(world, 0, TEST_MAP);
    addPlayer(world, 1, TEST_MAP);
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
    world.players[1].hp = 50;
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
    expect(world.players[1].hp).toBe(MAX_HP);
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
