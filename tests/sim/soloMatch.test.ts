/**
 * Solo mode: a whole match against a bot WITHOUT any server process or network.
 * The real server core, the real client netcode and the real bot run in one program,
 * connected by in-memory loopbacks - exactly what happens in the browser tab.
 *
 * The "human" in these tests is either idle or steered by a second bot brain.
 */
import { describe, expect, it } from 'vitest';
import { MAPS } from '../../src/shared/maps';
import { DEFAULT_MATCH_CONFIG } from '../../src/shared/match/matchConfig';
import { DIFFICULTIES, isDifficulty, type Difficulty } from '../../src/solo/difficulty';
import { createLoopback } from '../../src/solo/loopback';
import { expectHealthy, startSolo, type SoloRun } from '../soloHelpers';

const LEVELS = Object.keys(DIFFICULTIES) as Difficulty[];
const phase = (run: SoloRun) => run.phase();

describe('loopback connection', () => {
  it('delivers messages immediately in both directions and reports closing to both ends', () => {
    const link = createLoopback();
    const log: string[] = [];
    link.client.onMessage = (data) => log.push(`client got ${data}`);
    link.server.onMessage = (data) => log.push(`server got ${data}`);
    link.client.onClose = () => log.push('client closed');
    link.server.onClose = () => log.push('server closed');
    link.client.send('a');
    link.server.send('b');
    link.server.close();
    link.client.send('lost');
    link.client.close(); // closing twice does nothing
    expect(log).toEqual(['server got a', 'client got b', 'client closed', 'server closed']);
  });
});

describe('solo match setup', () => {
  it('starts at once: room, map, opponent and the normal best-of-5 rules', () => {
    const run = startSolo({ mapId: 'reaktor', difficulty: 'schwer', rules: DEFAULT_MATCH_CONFIG });
    const room = run.solo.client.room!;
    expect(room.mapId).toBe('reaktor');
    expect(room.slot).toBe(0);
    expect(room.roundsToWin).toBe(3);
    expect(room.players).toEqual([
      { slot: 0, name: 'Mika', connected: true },
      { slot: 1, name: DIFFICULTIES.schwer.botName, connected: true },
    ]);
    run.tick();
    run.tick();
    expect(phase(run)).toBe('countdown');
    expect(run.solo.client.snapshot!.players).toHaveLength(2);
    expectHealthy(run);
  });

  it('every difficulty has its own bot parameters, ordered from easy to hard', () => {
    expect(LEVELS).toEqual(['leicht', 'mittel', 'schwer']);
    const [easy, medium, hard] = LEVELS.map((level) => DIFFICULTIES[level].personality);
    for (const key of ['turnSpeed', 'attackChance', 'dashAttackChance', 'parryChance'] as const) {
      expect(easy[key], key).toBeLessThan(medium[key]);
      expect(medium[key], key).toBeLessThan(hard[key]);
    }
    expect(isDifficulty('schwer')).toBe(true);
    expect(isDifficulty('unmöglich')).toBe(false);
  });
});

describe('solo matches run to the end without a server', () => {
  const cases = Object.keys(MAPS).flatMap((mapId) => LEVELS.map((difficulty) => ({ mapId, difficulty })));

  it.each(cases)('map $mapId, difficulty $difficulty', ({ mapId, difficulty }) => {
    const run = startSolo({ mapId, difficulty, seed: 3, human: 'fights' });
    run.runUntil('match end', () => phase(run) === 'matchEnd');
    expect(run.events.some((e) => e.type === 'matchEnd')).toBe(true);
    expect(run.events.filter((e) => e.type === 'roundEnd').length).toBeGreaterThanOrEqual(2);
    expectHealthy(run);
  });

  it('without network delay the human client is never more than a few inputs ahead', () => {
    const run = startSolo({ human: 'fights', seed: 5 });
    run.runUntil('match end', () => phase(run) === 'matchEnd');
    expect(run.solo.client.stats.pendingInputs).toBeLessThanOrEqual(2);
    expect(run.solo.client.stats.rttMs).toBeLessThan(5);
  });
});

describe('the bot really fights', () => {
  it.each(LEVELS)('difficulty %s: the bot walks over and kills an idle player with its sword', (difficulty) => {
    const run = startSolo({ difficulty, human: 'idle', seed: 2 });
    const killedByBot = () => run.events.some((e) => e.type === 'hit' && e.attacker === 1 && e.hpLeft === 0);
    run.runUntil('the bot kills the idle human', killedByBot);
    expectHealthy(run);
  });

  it('the hard bot wins a whole match against an idle player', () => {
    const run = startSolo({ difficulty: 'schwer', human: 'idle', seed: 4 });
    run.runUntil('match end', () => phase(run) === 'matchEnd');
    expect(run.solo.client.snapshot!.match.matchWinner).toBe(1);
  });
});

describe('rematch and leaving', () => {
  it('after the match the bot votes for a rematch; it starts when the human presses R', () => {
    const run = startSolo({ difficulty: 'schwer', human: 'idle', seed: 4 });
    run.runUntil('match end', () => phase(run) === 'matchEnd');
    for (let i = 0; i < 300; i++) run.tick();
    const waiting = run.solo.client.snapshot!.match;
    expect(waiting.phase).toBe('matchEnd'); // nothing happens until the human decides
    expect(waiting.rematchVotes).toEqual([false, true]);

    run.solo.client.requestRematch();
    run.runUntil('new match', () => phase(run) === 'countdown', 10);
    const fresh = run.solo.client.snapshot!.match;
    expect(fresh.round).toBe(1);
    expect(fresh.scores).toEqual([0, 0]);

    // The second match can be played to its end as well.
    run.runUntil('second match end', () => phase(run) === 'matchEnd');
    expectHealthy(run);
  });

  it('leaving ends the match cleanly', () => {
    const run = startSolo({});
    for (let i = 0; i < 120; i++) run.tick();
    let left = false;
    run.solo.client.onRoomLeft = () => (left = true);
    run.solo.client.leaveRoom();
    expect(left).toBe(true);
    expect(run.solo.client.room).toBeNull();
    run.solo.dispose();
    for (let i = 0; i < 10; i++) run.solo.step(); // must not throw after the end
    expect(run.solo.server.stats().errors).toBe(0);
  });

  it('is reproducible: the same seed and the same inputs give the same match', () => {
    const play = () => {
      const run = startSolo({ human: 'fights', seed: 9 });
      run.runUntil('match end', () => phase(run) === 'matchEnd');
      return { scores: run.solo.client.snapshot!.match.scores, tick: run.solo.client.snapshot!.tick };
    };
    expect(play()).toEqual(play());
  });
});
