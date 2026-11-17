import { describe, expect, it } from 'vitest';
import { GameClient } from '../../src/netcode/gameClient';
import { INTERPOLATION_DELAY_TICKS, RenderClock, SnapshotBuffer } from '../../src/netcode/interpolation';
import { Predictor } from '../../src/netcode/predictor';
import { encodeMessage } from '../../src/shared/protocol/codec';
import type { ServerMessage, SnapshotMessage } from '../../src/shared/protocol/messages';
import type { Transport } from '../../src/shared/protocol/transport';
import { ARENA } from '../../src/shared/maps/arena';
import { clonePlayer, createPlayer } from '../../src/shared/sim/playerState';
import { stepPlayer } from '../../src/shared/sim/stepPlayer';
import { createWorld } from '../../src/shared/sim/world';
import { Button, input, standingPlayer, TEST_MAP } from '../helpers';
import { DUEL } from '../../src/shared/match/gameModes';

describe('Predictor', () => {
  it('predicts exactly what the server will compute', () => {
    const server = standingPlayer(0, 5);
    const predictor = new Predictor();
    predictor.reconcile(server, 0, TEST_MAP, 'playing', DUEL);

    for (let seq = 1; seq <= 20; seq++) {
      const cmd = input({ moveZ: 1, buttons: seq === 5 ? Button.Jump : 0 }, seq);
      predictor.predict(cmd, TEST_MAP, 'playing', DUEL);
      stepPlayer(server, cmd, TEST_MAP, 'playing', DUEL);
    }
    const result = predictor.reconcile(server, 20, TEST_MAP, 'playing', DUEL);
    expect(result.compared).toBe(true);
    expect(result.difference).toBe(0);
    expect(predictor.pendingCount).toBe(0);
  });

  it('replays unconfirmed inputs on top of the server state', () => {
    const server = standingPlayer(0, 5);
    const predictor = new Predictor();
    predictor.reconcile(server, 0, TEST_MAP, 'playing', DUEL);
    const cmds = Array.from({ length: 10 }, (_, i) => input({ moveZ: 1 }, i + 1));
    for (const cmd of cmds) predictor.predict(cmd, TEST_MAP, 'playing', DUEL);

    // The server has only processed the first 4 inputs so far.
    for (const cmd of cmds.slice(0, 4)) stepPlayer(server, cmd, TEST_MAP, 'playing', DUEL);
    const result = predictor.reconcile(server, 4, TEST_MAP, 'playing', DUEL);
    expect(result.difference).toBe(0);
    expect(result.replayed).toBe(6);

    // The prediction must equal "server state + remaining 6 inputs".
    const expected = clonePlayer(server);
    for (const cmd of cmds.slice(4)) stepPlayer(expected, cmd, TEST_MAP, 'playing', DUEL);
    expect(predictor.state).toEqual(expected);
  });

  it('rolls back when the server disagrees (e.g. knockback) and keeps the pending inputs', () => {
    const server = standingPlayer(0, 5);
    const predictor = new Predictor();
    predictor.reconcile(server, 0, TEST_MAP, 'playing', DUEL);
    const cmds = Array.from({ length: 6 }, (_, i) => input({}, i + 1));
    for (const cmd of cmds) predictor.predict(cmd, TEST_MAP, 'playing', DUEL);

    for (const cmd of cmds.slice(0, 3)) stepPlayer(server, cmd, TEST_MAP, 'playing', DUEL);
    server.vel.x = 6; // something the client could not know about
    server.pos.x += 0.1;
    const result = predictor.reconcile(server, 3, TEST_MAP, 'playing', DUEL);
    expect(result.difference).toBeGreaterThan(0);
    expect(result.positionError).toBeCloseTo(0.1);

    const expected = clonePlayer(server);
    for (const cmd of cmds.slice(3)) stepPlayer(expected, cmd, TEST_MAP, 'playing', DUEL);
    expect(predictor.state).toEqual(expected);
    expect(predictor.state!.pos.x).toBeGreaterThan(0.1);
  });

  it('does not move while the phase freezes players', () => {
    const predictor = new Predictor();
    predictor.reconcile(standingPlayer(0, 5), 0, TEST_MAP, 'countdown', DUEL);
    predictor.predict(input({ moveZ: 1 }, 1), TEST_MAP, 'countdown', DUEL);
    expect(predictor.state!.pos.z).toBe(5);
  });
});

describe('SnapshotBuffer', () => {
  const at = (x: number, yaw = 0) => [{ ...createPlayer(1, { pos: { x, y: 0, z: 0 }, yaw }) }];

  it('blends between the two snapshots around the render tick', () => {
    const buffer = new SnapshotBuffer();
    buffer.push(10, at(0));
    buffer.push(12, at(2));
    expect(buffer.sample(11, 1)!.pos.x).toBeCloseTo(1);
    expect(buffer.sample(10.5, 1)!.pos.x).toBeCloseTo(0.5);
  });

  it('clamps to the oldest/newest snapshot instead of guessing', () => {
    const buffer = new SnapshotBuffer();
    buffer.push(10, at(0));
    buffer.push(12, at(2));
    expect(buffer.sample(5, 1)!.pos.x).toBe(0);
    expect(buffer.sample(99, 1)!.pos.x).toBe(2);
  });

  it('turns the short way around', () => {
    const buffer = new SnapshotBuffer();
    buffer.push(0, at(0, 3));
    buffer.push(2, at(0, -3));
    expect(Math.abs(buffer.sample(1, 1)!.yaw)).toBeGreaterThan(3);
  });

  it('returns null for unknown players or an empty buffer', () => {
    const buffer = new SnapshotBuffer();
    expect(buffer.sample(1, 1)).toBeNull();
    buffer.push(1, at(0));
    expect(buffer.sample(1, 0)).toBeNull();
  });
});

describe('RenderClock', () => {
  it('runs behind the newest snapshot by the interpolation delay', () => {
    const clock = new RenderClock();
    clock.onSnapshot(100);
    expect(clock.renderTick).toBe(100 - INTERPOLATION_DELAY_TICKS);
    clock.advance(1000 / 60);
    expect(clock.renderTick).toBeCloseTo(101 - INTERPOLATION_DELAY_TICKS);
  });
});

describe('GameClient desync detection', () => {
  /** A client connected to nothing; the test plays the role of the server. */
  function connectedClient() {
    const sent: string[] = [];
    const transport: Transport = { send: (d) => sent.push(d), close: () => {}, onMessage: () => {}, onClose: () => {} };
    const client = new GameClient(transport);
    const receive = (message: ServerMessage) => transport.onMessage(encodeMessage(message));
    receive({ type: 'roomJoined', code: 'TEST', slot: 0, mapId: ARENA.id, modeId: 'duel', token: 'abcdef0123456789', roundsToWin: 3, players: [{ slot: 0, name: 'x', connected: true }] });
    const serverPlayer = createPlayer(0, ARENA.spawns[0]);
    const snapshot = (overrides: Partial<SnapshotMessage>): SnapshotMessage => ({
      type: 'snapshot',
      tick: 0,
      ack: 0,
      clean: false,
      players: [serverPlayer],
      match: createWorld(ARENA.id).match,
      events: [],
      ...overrides,
    });
    receive(snapshot({}));
    return { client, receive, snapshot, serverPlayer, sent };
  }

  it('sends no inputs before the first snapshot', () => {
    const transport: Transport = { send: () => {}, close: () => {}, onMessage: () => {}, onClose: () => {} };
    const client = new GameClient(transport);
    client.tick({ moveX: 0, moveZ: 1, yaw: 0, pitch: 0, buttons: 0 });
    expect(client.stats.inputsSent).toBe(0);
  });

  it('a correct prediction counts as neither correction nor desync', () => {
    const { client, receive, snapshot, serverPlayer } = connectedClient();
    for (let seq = 1; seq <= 4; seq++) {
      client.tick({ moveX: 0, moveZ: 1, yaw: 0, pitch: 0, buttons: 0 });
      stepPlayer(serverPlayer, input({ moveZ: 1 }, seq), ARENA, 'waiting', DUEL);
    }
    receive(snapshot({ tick: 4, ack: 4, clean: true }));
    expect(client.stats.desyncs).toBe(0);
    expect(client.stats.corrections).toBe(0);
  });

  it('a mismatch on a disturbed snapshot is an expected correction', () => {
    const { client, receive, snapshot, serverPlayer } = connectedClient();
    client.tick({ moveX: 0, moveZ: 1, yaw: 0, pitch: 0, buttons: 0 });
    stepPlayer(serverPlayer, input({ moveZ: 1 }, 1), ARENA, 'waiting', DUEL);
    serverPlayer.vel.x = 5; // e.g. knockback
    receive(snapshot({ tick: 1, ack: 1, clean: false }));
    expect(client.stats.corrections).toBe(1);
    expect(client.stats.desyncs).toBe(0);
    expect(client.localPlayer!.vel.x).toBe(5);
  });

  it('a mismatch on a clean snapshot is reported as a desync with the differing fields', () => {
    const { client, receive, snapshot, serverPlayer } = connectedClient();
    client.tick({ moveX: 0, moveZ: 1, yaw: 0, pitch: 0, buttons: 0 });
    stepPlayer(serverPlayer, input({ moveZ: 1 }, 1), ARENA, 'waiting', DUEL);
    serverPlayer.vel.x = 5; // the server claims nothing special happened, yet the state differs
    receive(snapshot({ tick: 1, ack: 1, clean: true }));
    expect(client.stats.desyncs).toBe(1);
    expect(client.stats.desyncDetails[0]).toContain('vel.x');
  });
});
