/**
 * Bot simulation tests: complete matches between two bots, using the real server code
 * and the real client netcode over a simulated network (virtual time, so they are fast).
 *
 * The key assertion everywhere is `desyncs === 0`: whenever the server says "nothing
 * unusual happened to you", the client's prediction must match the server exactly.
 */
import { describe, expect, it } from 'vitest';
import { Bot } from '../../src/bots/bot';
import { DEFAULT_PERSONALITY } from '../../src/bots/brain';
import { MemoryNetwork } from '../../src/bots/memoryNetwork';
import { findProblems, totalUsage, type MatchReport } from '../../src/bots/report';
import { runSimulatedMatch } from '../../src/bots/simulation';
import { GameServer } from '../../src/server/gameServer';
import { TICK_MS } from '../../src/shared/config';
import { MAPS } from '../../src/shared/maps';
import { FAST_MATCH_CONFIG } from '../../src/shared/match/matchConfig';
import type { Transport } from '../../src/shared/protocol/transport';

function expectHealthy(report: MatchReport): void {
  expect(findProblems({ matches: [report], server: null })).toEqual([]);
  expect(report.finished).toBe(true);
  for (const bot of report.bots) {
    expect(bot.desyncs).toBe(0);
    expect(bot.errors).toEqual([]);
    expect(bot.snapshots).toBeGreaterThan(50);
  }
}

describe('bot matches on every map', () => {
  it.each(Object.keys(MAPS))('map "%s": matches finish without any desync', (mapId) => {
    for (let seed = 1; seed <= 4; seed++) {
      const report = runSimulatedMatch({ seed, mapId, latencyMs: 60, jitterMs: 30, clockDrift: 0.002 });
      expect(report.mapId).toBe(mapId);
      expectHealthy(report);
    }
  });
});

describe('bot matches in the arena mode', () => {
  it.each(Object.keys(MAPS))('map "%s": arena matches finish without any desync, with non-lethal hits', (mapId) => {
    let survivedHits = 0;
    for (let seed = 1; seed <= 2; seed++) {
      const report = runSimulatedMatch({ seed, mapId, modeId: 'arena', latencyMs: 60, jitterMs: 30, clockDrift: 0.002 });
      expect(report.modeId).toBe('arena');
      expectHealthy(report);
      survivedHits += report.bots.reduce((sum, bot) => sum + bot.usage.wounds, 0);
    }
    expect(survivedHits).toBeGreaterThan(0);
  });
});

describe('the bots really use the mechanics (so the desync check covers them)', () => {
  const PARRYING_BOT = { ...DEFAULT_PERSONALITY, parryChance: 1, dodgeChance: 0, reactionTicks: 2 };
  it('wall-run, wall-jump, dash, dash attack, parry and kills all happen', () => {
    const reports = Object.keys(MAPS).flatMap((mapId) =>
      // botB parries eagerly: since the faster sprint (flow update) default bots rarely parry,
      // and the desync check must still cover parries.
      [1, 2, 3, 4, 5].map((seed) =>
        runSimulatedMatch({ seed, mapId, latencyMs: 40, jitterMs: 20, personalities: [undefined, PARRYING_BOT] }),
      ),
    );
    const usage = totalUsage(reports);
    expect(usage.wallRunTicks).toBeGreaterThan(200);
    expect(usage.wallJumps).toBeGreaterThan(2);
    expect(usage.dashes).toBeGreaterThan(10);
    expect(usage.dashAttacks).toBeGreaterThan(5);
    expect(usage.parries).toBeGreaterThan(3);
    expect(usage.kills).toBeGreaterThan(20);
  });
});

describe('reconnect in whole matches', () => {
  it('a bot that loses its connection mid-match comes back and the match finishes cleanly', () => {
    for (const [seed, bot] of [[1, 0], [2, 1], [3, 0]]) {
      const server = new GameServer({ matchConfig: FAST_MATCH_CONFIG });
      const report = runSimulatedMatch({
        seed,
        server,
        latencyMs: 40,
        jitterMs: 20,
        disconnect: { bot, atMs: 2500, forMs: 800 },
      });
      expectHealthy(report);
      expect(server.lobby.roomCount).toBe(0);
      expect(server.stats().errors).toBe(0);
    }
  });

  it('if the bot stays away too long, the other one ends up alone (no crash, no desync)', () => {
    const server = new GameServer({ matchConfig: FAST_MATCH_CONFIG });
    const report = runSimulatedMatch({
      seed: 4,
      server,
      latencyMs: 40,
      maxSeconds: 12,
      disconnect: { bot: 1, atMs: 1500, forMs: 5000 }, // longer than the reserved time
    });
    expect(report.finished).toBe(false); // the match was abandoned
    for (const bot of report.bots) expect(bot.desyncs).toBe(0);
    expect(report.bots[0].errors).toEqual([]);
    expect(report.bots[1].errors).toEqual(['rejoin_failed: The seat is no longer available.']);
    expect(server.stats().errors).toBe(0);
    expect(server.lobby.roomCount).toBe(0);
  });
});

describe('lag compensation in whole matches', () => {
  it('at 100 ms ping swings still kill (most rounds end by a sword hit)', () => {
    const reports = [1, 2, 3, 4, 5, 6].map((seed) => runSimulatedMatch({ seed, latencyMs: 50, jitterMs: 10 }));
    for (const report of reports) expectHealthy(report);
    const rounds = reports.reduce((sum, r) => sum + r.rounds, 0);
    expect(totalUsage(reports).kills).toBeGreaterThan(rounds * 0.5);
  });
});

describe('bot matches over a simulated network', () => {
  it('finishes matches on a perfect connection without any desync', () => {
    for (let seed = 1; seed <= 5; seed++) expectHealthy(runSimulatedMatch({ seed }));
  });

  it('survives latency, jitter and clock drift without any desync', () => {
    for (let seed = 1; seed <= 10; seed++) {
      expectHealthy(runSimulatedMatch({ seed, latencyMs: 80, jitterMs: 40, clockDrift: 0.003 }));
    }
  });

  it('survives a terrible connection (300 ms, heavy jitter)', () => {
    for (let seed = 1; seed <= 3; seed++) {
      expectHealthy(runSimulatedMatch({ seed, latencyMs: 300, jitterMs: 200, clockDrift: 0.01 }));
    }
  });

  it('works with quick match instead of room codes', () => {
    expectHealthy(runSimulatedMatch({ seed: 3, latencyMs: 40, useQuickMatch: true }));
  });

  it('is reproducible: the same seed gives exactly the same match', () => {
    const options = { seed: 11, latencyMs: 50, jitterMs: 25 };
    const first = runSimulatedMatch(options);
    const second = runSimulatedMatch(options);
    expect(second.winner).toBe(first.winner);
    expect(second.durationSec).toBe(first.durationSec);
    expect(second.bots.map((b) => b.corrections)).toEqual(first.bots.map((b) => b.corrections));
  });

  it('really fights: most matches have a winner and rounds end by sword kills', () => {
    const reports = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((seed) => runSimulatedMatch({ seed, latencyMs: 30 }));
    // With one-hit kills, trades (both die) happen - so a few matches end in a draw.
    const decided = reports.filter((r) => r.winner !== null && r.winner >= 0);
    expect(decided.length).toBeGreaterThanOrEqual(6);
    expect(totalUsage(reports).kills).toBeGreaterThan(15);
  });

  it('frees the room on the server after the bots disconnect', () => {
    const server = new GameServer({ matchConfig: FAST_MATCH_CONFIG });
    runSimulatedMatch({ seed: 1, server });
    expect(server.lobby.roomCount).toBe(0);
    expect(server.stats().errors).toBe(0);
  });

  it('with zero latency, corrections only come from real interactions', () => {
    const report = runSimulatedMatch({ seed: 2 });
    // Hits, respawns, pushes and phase changes cause a handful of corrections - not hundreds.
    // Measured for seeds 1-6: 6-13 % of the snapshots (shorter matches = higher share).
    for (const bot of report.bots) expect(bot.corrections).toBeLessThan(bot.snapshots * 0.15);
  });
});

describe('the desync detector itself', () => {
  /**
   * Proof that the detector works: this "cheating" connection changes the input AFTER
   * the client has predicted it. Client and server then simulate different inputs, which
   * must be reported as a desync.
   */
  function tamperInputs(transport: Transport): void {
    const originalSend = transport.send.bind(transport);
    transport.send = (data) => originalSend(data.replace('"moveZ":1', '"moveZ":-1'));
  }

  it('reports a desync when client and server simulate different things', () => {
    const net = new MemoryNetwork({ latencyMs: 20, jitterMs: 0, seed: 1 });
    const server = new GameServer({ matchConfig: FAST_MATCH_CONFIG });
    const bots = [0, 1].map((i) => {
      const link = net.createLink();
      server.attach(link.server);
      const bot = new Bot(link.client, { name: `bot${i}`, seed: i + 1, now: () => net.nowMs });
      if (i === 0) tamperInputs(link.client);
      return bot;
    });
    bots[0].client.onRoomJoined = (room) => bots[1].client.joinRoom(room.code, 'bot1');
    bots[0].client.createRoom('bot0');

    for (let tick = 0; tick < 300; tick++) {
      net.advanceTo(tick * TICK_MS);
      server.tick();
      for (const bot of bots) bot.tick();
    }
    expect(bots[0].client.stats.desyncs).toBeGreaterThan(0);
    expect(bots[0].client.stats.desyncDetails[0]).toMatch(/pos|vel/);
    expect(bots[1].client.stats.desyncs).toBe(0); // the honest bot is unaffected
  });
});
