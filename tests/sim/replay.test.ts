/**
 * Replays: a match is recorded as start world + inputs per tick. Calculating it again must
 * give EXACTLY the same match - checked with hashes of the whole world.
 */
import { describe, expect, it } from 'vitest';
import { MAPS } from '../../src/shared/maps';
import { packInput, parseReplay, serializeReplay, unpackInput, type ReplayFile } from '../../src/shared/replay/replayFormat';
import { ReplaySimulator } from '../../src/shared/replay/replaySimulator';
import { hashState } from '../../src/shared/sim/stateDiff';
import { startSolo } from '../soloHelpers';

/** Play a whole solo match (human steered by a bot brain) and return its replay. */
function recordMatch(mapId = 'reaktor', seed = 3): { file: ReplayFile; serverHash: number } {
  const run = startSolo({ mapId, difficulty: 'schwer', seed, human: 'fights' });
  run.runUntil('match end', () => run.phase() === 'matchEnd');
  const room = run.solo.server.lobby.getRoom(run.solo.client.room!.code)!;
  return { file: run.solo.replay()!, serverHash: hashState(room.world) };
}

describe('replay format', () => {
  it('packs inputs without losing anything, even -0', () => {
    const cmd = { seq: 0, moveX: -1, moveZ: 1, yaw: -0, pitch: 0.123456789, buttons: 13, viewTick: 812.25 };
    const back = unpackInput(packInput(cmd));
    expect(back).toEqual(cmd);
    expect(Object.is(back.yaw, -0)).toBe(true);
  });

  it('rejects files that are not replays', () => {
    for (const text of ['', 'hello', '{}', '{"format":"neonklinge-replay","version":99}', '[1,2]']) {
      expect(parseReplay(text)).toBeNull();
    }
  });
});

describe('replay of a whole match', () => {
  const { file, serverHash } = recordMatch();

  it('records the match from its start to its end', () => {
    expect(file.mapId).toBe('reaktor');
    expect(file.seed).toBe(3);
    expect(file.players.map((p) => p.slot)).toEqual([0, 1]);
    expect(file.ticks.length).toBeGreaterThan(600);
    expect(file.finalHash).toBe(serverHash); // the recording ends where the server is
  });

  it('calculating it again gives exactly the same world (hash of every checkpoint and of the end)', () => {
    const sim = new ReplaySimulator(file);
    expect(sim.verifyAll()).toBe(true);
    expect(sim.mismatches).toEqual([]);
    expect(hashState(sim.world)).toBe(serverHash);
    expect(sim.world.match.phase).toBe('matchEnd');
  });

  it('survives export and import as a file (text) unchanged', () => {
    const text = serializeReplay(file);
    const imported = parseReplay(text)!;
    expect(imported).not.toBeNull();
    expect(new ReplaySimulator(imported).verifyAll()).toBe(true);
  });

  it('jumping around (backward, forward, to the start) always gives the same world as playing straight through', () => {
    const straight = new ReplaySimulator(file);
    const hashes = new Map<number, number>();
    while (!straight.atEnd) {
      straight.step();
      if (straight.tick % 97 === 0) hashes.set(straight.tick, hashState(straight.world));
    }
    const jumper = new ReplaySimulator(file);
    const targets = [...hashes.keys()];
    for (const tick of [targets[5], targets[1], targets.at(-1)!, targets[3], targets[0], targets.at(-2)!]) {
      jumper.seek(tick);
      expect(jumper.tick).toBe(tick);
      expect(hashState(jumper.world), `after seek to ${tick}`).toBe(hashes.get(tick));
    }
    jumper.seek(-5);
    expect(jumper.tick).toBe(jumper.firstTick);
  });

  it('notices when the replay does not fit (a changed input changes the result)', () => {
    const tampered = parseReplay(serializeReplay(file))!;
    // Make player 1 hold "forward" for a second in the middle of the match.
    const middle = Math.floor(tampered.ticks.length / 2);
    for (let i = middle; i < middle + 60; i++) {
      const input = tampered.ticks[i][1];
      if (input) input[1] = input[1] === 1 ? -1 : 1;
    }
    const sim = new ReplaySimulator(tampered);
    expect(sim.verifyAll()).toBe(false);
    expect(sim.mismatches.length).toBeGreaterThan(0);
    expect(sim.mismatches[0].tick).toBeGreaterThan(tampered.startWorld.tick + middle);
  });

  it('includes rematches: a second match after the vote is replayed exactly too', () => {
    const run = startSolo({ mapId: 'arena', difficulty: 'schwer', seed: 4, human: 'idle' });
    run.runUntil('match end', () => run.phase() === 'matchEnd');
    run.solo.client.requestRematch(); // the bot has voted already
    run.runUntil('second match running', () => run.phase() === 'playing');
    for (let i = 0; i < 300; i++) run.tick();
    const replay = run.solo.replay()!;
    expect(replay.actions.map((a) => a.type)).toEqual(['rematch', 'rematch']);
    expect(new ReplaySimulator(replay).verifyAll()).toBe(true);
  });
});

describe('replays on every map', () => {
  it.each(Object.keys(MAPS))('%s: a recorded match is calculated again identically', (mapId) => {
    const { file } = recordMatch(mapId, 7);
    expect(new ReplaySimulator(parseReplay(serializeReplay(file))!).verifyAll()).toBe(true);
  });
});
