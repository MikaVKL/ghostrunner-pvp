/**
 * Integration test: starts the REAL server (HTTP + WebSocket + 60 Hz timer) on a free
 * port and lets real bots play over real sockets in real time. Takes a few seconds.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runLiveMatch } from '../../src/bots/liveRunner';
import { findProblems } from '../../src/bots/report';
import { connectWebSocket } from '../../src/netcode/webSocketTransport';
import type { ServerStats } from '../../src/server/gameServer';
import { startServer, type RunningServer } from '../../src/server/startServer';
import { FAST_MATCH_CONFIG } from '../../src/shared/match/matchConfig';
import { parseServerMessage } from '../../src/shared/protocol/codec';

let server: RunningServer;
const wsUrl = () => `ws://localhost:${server.port}/ws`;
const httpUrl = (path: string) => `http://localhost:${server.port}${path}`;

beforeAll(async () => {
  server = await startServer({ port: 0, matchConfig: FAST_MATCH_CONFIG, staticDir: 'does-not-exist' });
});

afterAll(async () => {
  await server.close();
});

describe('live server', () => {
  it('answers the health and stats endpoints', async () => {
    expect(await fetch(httpUrl('/health')).then((r) => r.json())).toEqual({ ok: true });
    const stats = (await fetch(httpUrl('/stats')).then((r) => r.json())) as ServerStats;
    expect(stats.rooms).toBe(0);
    expect(stats.errors).toBe(0);
  });

  it('greets WebSocket clients and survives garbage input', async () => {
    const socket = await connectWebSocket(wsUrl());
    const messages: string[] = [];
    socket.onMessage = (data) => messages.push(data);
    socket.send('this is not json');
    socket.send('{"type":"joinRoom","code":"NOPE","name":"x"}');
    await new Promise((resolve) => setTimeout(resolve, 200));
    socket.close();

    const types = messages.map((m) => parseServerMessage(m)?.type);
    expect(types).toContain('welcome');
    expect(types.filter((t) => t === 'error')).toHaveLength(2);
    expect(server.game.stats().errors).toBe(0);
  });

  it('two bots play full matches over real WebSockets without desyncs', async () => {
    const reports = await Promise.all([
      runLiveMatch({ url: wsUrl(), label: 'codes', seed: 1, timeoutSec: 25 }),
      runLiveMatch({ url: wsUrl(), label: 'lagged', seed: 2, lagMs: 40, jitterMs: 20, timeoutSec: 25 }),
    ]);
    // The first test sent two invalid messages on purpose; ignore those here.
    const stats = { ...server.game.stats(), badMessages: 0 };
    expect(findProblems({ matches: reports, server: stats })).toEqual([]);
    for (const report of reports) {
      expect(report.finished).toBe(true);
      for (const bot of report.bots) {
        expect(bot.desyncs).toBe(0);
        expect(bot.snapshots).toBeGreaterThan(30);
      }
    }
    expect(stats.tick.ticks).toBeGreaterThan(60);
  }, 30_000);

  it('frees all rooms after the clients disconnect', async () => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(server.game.stats().rooms).toBe(0);
  });
});
