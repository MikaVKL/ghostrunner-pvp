/**
 * Reconnect: a lost connection keeps the seat reserved, pauses the match, and the client
 * can take the seat again with its secret token.
 */
import { describe, expect, it } from 'vitest';
import { pauseMatch, resumeMatch } from '../../src/shared/match/lifecycle';
import { FAST_MATCH_CONFIG } from '../../src/shared/match/matchConfig';
import { stepWorld } from '../../src/shared/sim/stepWorld';
import { playingWorld, runWorld, TEST_CTX } from '../helpers';
import { createMatch, createTestServer, TestClient, tickUntilPlaying } from '../serverHelpers';

const RECONNECT_TICKS = FAST_MATCH_CONFIG.reconnectTicks;

function ticks(server: ReturnType<typeof createTestServer>, count: number): void {
  for (let i = 0; i < count; i++) server.tick();
}

describe('pause and resume (match rules)', () => {
  it('a paused match freezes the players and the round timer', () => {
    const world = playingWorld();
    const [a] = world.players;
    const timeLeft = world.match.phaseTicksLeft;
    pauseMatch(world, 100);
    const before = { ...a.pos };
    runWorld(world, { 0: { seq: 1, moveX: 0, moveZ: 1, yaw: 0, pitch: 0, buttons: 0, viewTick: 0 } }, 30);
    expect(world.match.phase).toBe('paused');
    expect(a.pos).toEqual(before);
    expect(world.match.resumeTicksLeft).toBe(timeLeft);
    expect(world.match.phaseTicksLeft).toBe(70); // counts down for the HUD
  });

  it('resuming an interrupted round replays it from the countdown, scores are kept', () => {
    const world = playingWorld();
    world.match.scores = [1, 0];
    world.match.round = 2;
    world.players[0].pos.x = 7;
    pauseMatch(world, 100);
    resumeMatch(world, TEST_CTX);
    expect(world.match.phase).toBe('countdown');
    expect(world.match.round).toBe(2);
    expect(world.match.scores).toEqual([1, 0]);
    expect(world.players[0].pos).toEqual(TEST_CTX.map.spawns[0].pos);
  });

  it('a pause between rounds continues exactly where it stopped', () => {
    const world = playingWorld();
    world.players[1].hp = 0;
    stepWorld(world, {}, TEST_CTX);
    expect(world.match.phase).toBe('roundEnd');
    const left = world.match.phaseTicksLeft;
    pauseMatch(world, 100);
    runWorld(world, {}, 10);
    resumeMatch(world, TEST_CTX);
    expect(world.match.phase).toBe('roundEnd');
    expect(world.match.phaseTicksLeft).toBe(left);
    expect(world.match.scores).toEqual([1, 0]);
  });

  it('practice mode is never paused', () => {
    const world = playingWorld();
    world.match.phase = 'waiting';
    pauseMatch(world, 100);
    expect(world.match.phase).toBe('waiting');
  });
});

describe('reconnect on the server', () => {
  it('every player gets its own secret token when joining', () => {
    const { a, b } = createMatch();
    expect(a.token).toMatch(/^[0-9a-f]{32}$/);
    expect(b.token).not.toBe(a.token);
  });

  it('a lost connection pauses the match and keeps the seat reserved', () => {
    const { server, a, b } = createMatch();
    tickUntilPlaying(server, a);
    b.disconnect();
    expect(server.lobby.playerCount).toBe(2);
    expect(a.last('roomUpdate')!.players).toEqual([
      { slot: 0, name: 'A', connected: true },
      { slot: 1, name: 'B', connected: false },
    ]);
    ticks(server, 4);
    expect(a.snapshot!.match.phase).toBe('paused');

    // Nobody else can take the reserved seat.
    const c = new TestClient(server);
    c.send({ type: 'joinRoom', code: a.roomCode, name: 'C' });
    expect(c.last('error')!.code).toBe('room_full');
  });

  it('with the token, a new connection takes the old seat and the round restarts', () => {
    const { server, a, b } = createMatch();
    tickUntilPlaying(server, a);
    server.lobby.getRoom(a.roomCode)!.world.match.scores = [0, 1];
    b.disconnect();
    ticks(server, 30);

    const b2 = new TestClient(server);
    b2.send({ type: 'rejoin', code: a.roomCode, token: b.token });
    const joined = b2.last('roomJoined')!;
    expect(joined.slot).toBe(1);
    expect(joined.players.every((p) => p.connected)).toBe(true);
    expect(a.last('roomUpdate')!.players[1]).toEqual({ slot: 1, name: 'B', connected: true });

    ticks(server, 2);
    expect(b2.snapshot!.match.phase).toBe('countdown');
    expect(b2.snapshot!.match.scores).toEqual([0, 1]);
    expect(b2.snapshot!.players).toHaveLength(2);

    // The match goes on normally, and the returned player controls its old character.
    tickUntilPlaying(server, b2);
    const startX = b2.snapshot!.players[1].pos.x;
    for (let i = 0; i < 30; i++) {
      b2.sendInput({ moveZ: 1, yaw: Math.PI / 2 }); // walk toward -X
      server.tick();
    }
    expect(b2.snapshot!.players[1].pos.x).toBeLessThan(startX - 2);
    expect(b2.snapshot!.ack).toBe(30);
    expect(server.stats().errors).toBe(0);
  });

  it('refuses a wrong token, a wrong room and a seat that is not free', () => {
    const { server, a, b } = createMatch();
    b.disconnect();
    const intruder = new TestClient(server);
    intruder.send({ type: 'rejoin', code: a.roomCode, token: '0123456789abcdef0123456789abcdef' });
    expect(intruder.last('error')!.code).toBe('rejoin_failed');
    intruder.send({ type: 'rejoin', code: 'ZZZZ', token: b.token });
    expect(intruder.last('error')!.code).toBe('rejoin_failed');
    intruder.send({ type: 'rejoin', code: a.roomCode, token: a.token }); // a is still connected
    expect(intruder.last('error')!.code).toBe('rejoin_failed');
    intruder.sendRaw('{"type":"rejoin","code":"ABCD","token":"not hex!"}');
    expect(intruder.last('error')!.code).toBe('bad_message');
    expect(intruder.last('roomJoined')).toBeUndefined();
  });

  it('gives the seat up when the player does not come back in time', () => {
    const { server, a, b } = createMatch();
    tickUntilPlaying(server, a);
    b.disconnect();
    ticks(server, RECONNECT_TICKS);
    expect(server.lobby.playerCount).toBe(2);
    ticks(server, 4);
    expect(server.lobby.playerCount).toBe(1);
    expect(a.last('roomUpdate')!.players).toHaveLength(1);
    expect(a.snapshot!.match.phase).toBe('waiting');

    const late = new TestClient(server);
    late.send({ type: 'rejoin', code: a.roomCode, token: b.token });
    expect(late.last('error')!.code).toBe('rejoin_failed');
  });

  it('a room whose only player lost its connection is kept for a while, then deleted', () => {
    const server = createTestServer();
    const a = new TestClient(server);
    a.send({ type: 'createRoom', name: 'A' });
    a.disconnect();
    ticks(server, 10);
    expect(server.lobby.roomCount).toBe(1);

    const a2 = new TestClient(server);
    a2.send({ type: 'rejoin', code: a.roomCode, token: a.token });
    expect(a2.last('roomJoined')!.slot).toBe(0);
    a2.disconnect();
    ticks(server, RECONNECT_TICKS + 2);
    expect(server.lobby.roomCount).toBe(0);
  });

  it('if both players lose their connection, the match waits for both', () => {
    const { server, a, b } = createMatch();
    tickUntilPlaying(server, a);
    a.disconnect();
    b.disconnect();
    ticks(server, 10);
    const a2 = new TestClient(server);
    a2.send({ type: 'rejoin', code: a.roomCode, token: a.token });
    ticks(server, 2);
    expect(a2.snapshot!.match.phase).toBe('paused');
    const b2 = new TestClient(server);
    b2.send({ type: 'rejoin', code: a.roomCode, token: b.token });
    ticks(server, 2);
    expect(a2.snapshot!.match.phase).toBe('countdown');
  });

  it('quick match does not put a new player into a room with a reserved seat', () => {
    const server = createTestServer();
    const a = new TestClient(server);
    a.send({ type: 'quickMatch', name: 'A' });
    a.disconnect();
    const b = new TestClient(server);
    b.send({ type: 'quickMatch', name: 'B' });
    expect(b.roomCode).not.toBe(a.roomCode);
  });
});
