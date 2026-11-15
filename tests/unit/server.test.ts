import { describe, expect, it } from 'vitest';
import { SNAPSHOT_EVERY_TICKS, TICK_DT } from '../../src/shared/config';
import { MOVE } from '../../src/shared/movement/movementConfig';
import { createMatch, createTestServer, TestClient, tickUntilPlaying } from '../serverHelpers';

describe('authoritative server', () => {
  it('sends a snapshot every SNAPSHOT_EVERY_TICKS ticks', () => {
    const { server, a } = createMatch();
    for (let i = 0; i < 20; i++) server.tick();
    expect(a.all('snapshot')).toHaveLength(20 / SNAPSHOT_EVERY_TICKS);
  });

  it('moves a player only according to its inputs', () => {
    const { server, a } = createMatch();
    tickUntilPlaying(server, a);
    const startX = a.snapshot!.players[0].pos.x;
    for (let i = 0; i < 30; i++) {
      a.sendInput({ moveZ: 1, yaw: -Math.PI / 2 }); // walk toward +X
      server.tick();
    }
    const snapshot = a.snapshot!;
    expect(snapshot.players[0].pos.x).toBeGreaterThan(startX + 2);
    expect(snapshot.ack).toBe(30);
    expect(snapshot.players[1].pos.x).toBe(14); // the other player did not move
  });

  it('speed hack: sending many inputs per tick does not make a player faster', () => {
    const { server, a } = createMatch();
    tickUntilPlaying(server, a);
    const startX = a.snapshot!.players[0].pos.x;
    const ticks = 30;
    for (let i = 0; i < ticks; i++) {
      for (let burst = 0; burst < 3; burst++) a.sendInput({ moveZ: 1, yaw: -Math.PI / 2 });
      server.tick();
    }
    const moved = a.snapshot!.players[0].pos.x - startX;
    expect(moved).toBeLessThanOrEqual(MOVE.runSpeed * ticks * TICK_DT + 1e-6);
  });

  it('marks snapshots as clean only when inputs arrive one per tick', () => {
    const { server, a } = createMatch();
    tickUntilPlaying(server, a);
    for (let i = 0; i < 10; i++) {
      a.sendInput({ moveZ: 1 });
      server.tick();
    }
    expect(a.snapshot!.clean).toBe(true);
    server.tick(); // no input this tick => the server had to guess
    server.tick();
    expect(a.snapshot!.clean).toBe(false);
  });

  it('answers pings', () => {
    const client = new TestClient(createTestServer());
    client.send({ type: 'ping', t: 123 });
    expect(client.last('pong')).toEqual({ type: 'pong', t: 123 });
  });
});

describe('server robustness', () => {
  it('answers invalid messages with an error and keeps running', () => {
    const { server, a } = createMatch();
    const garbage = ['', '{', 'null', '{"type":"input","cmd":{"seq":-1}}', '{"type":"hack"}', '\u0000\u0001'];
    for (const text of garbage) a.sendRaw(text);
    expect(a.all('error')).toHaveLength(garbage.length);
    expect(server.stats().badMessages).toBe(garbage.length);
    server.tick();
    expect(server.stats().errors).toBe(0);
  });

  it('ignores inputs from a client that is not in a room', () => {
    const server = createTestServer();
    const client = new TestClient(server);
    client.sendInput({ moveZ: 1 });
    server.tick();
    expect(server.stats().errors).toBe(0);
  });

  it('disconnects a client that floods the server with messages', () => {
    const { server, a, b } = createMatch();
    for (let i = 0; i < 500; i++) a.sendInput();
    expect(a.closedByServer).toBe(true);
    expect(server.lobby.playerCount).toBe(1);
    expect(b.last('roomUpdate')!.players).toHaveLength(1);
  });

  it('allows a normal message rate forever', () => {
    const { server, a } = createMatch();
    for (let i = 0; i < 600; i++) {
      a.sendInput();
      if (i % 30 === 0) a.send({ type: 'ping', t: i });
      server.tick();
    }
    expect(a.closedByServer).toBe(false);
  });

  it('reports tick statistics', () => {
    const { server } = createMatch();
    for (let i = 0; i < 100; i++) server.tick();
    const stats = server.stats();
    expect(stats.tick.ticks).toBe(100);
    expect(stats.tick.avgMs).toBeGreaterThan(0);
    expect(stats.rooms).toBe(1);
    expect(stats.players).toBe(2);
  });
});
