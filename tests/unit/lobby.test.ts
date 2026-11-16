import { describe, expect, it } from 'vitest';
import { generateRoomCode, generateUniqueRoomCode } from '../../src/server/lobby/roomCodes';
import { GameServer } from '../../src/server/gameServer';
import { DEFAULT_MAP_ID, MAP_ROTATION } from '../../src/shared/maps';
import { createRng } from '../../src/shared/math/rng';
import { FAST_MATCH_CONFIG } from '../../src/shared/match/matchConfig';
import { createMatch, createTestServer, TestClient } from '../serverHelpers';

describe('room codes', () => {
  it('are 4 characters without look-alike letters', () => {
    const rng = createRng(1);
    for (let i = 0; i < 200; i++) expect(generateRoomCode(rng)).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);
  });

  it('never returns a code that is already taken', () => {
    const taken = new Set<string>();
    const rng = createRng(2);
    for (let i = 0; i < 500; i++) {
      const code = generateUniqueRoomCode((c) => taken.has(c), rng);
      expect(taken.has(code)).toBe(false);
      taken.add(code);
    }
  });
});

describe('lobby', () => {
  it('greets a new connection', () => {
    const client = new TestClient(createTestServer());
    expect(client.last('welcome')).toMatchObject({ type: 'welcome', tickRate: 60 });
  });

  it('createRoom puts the player into a new room in practice mode', () => {
    const server = createTestServer();
    const a = new TestClient(server);
    a.send({ type: 'createRoom', name: 'Alice' });
    const joined = a.last('roomJoined')!;
    expect(joined.code).toHaveLength(4);
    expect(joined.slot).toBe(0);
    expect(joined.players).toEqual([{ slot: 0, name: 'Alice', connected: true }]);
    server.tick();
    server.tick();
    expect(a.snapshot!.match.phase).toBe('waiting');
    expect(a.snapshot!.players).toHaveLength(1);
  });

  it('joinRoom by code starts the match for both players', () => {
    const { server, a, b } = createMatch();
    expect(b.last('roomJoined')!.slot).toBe(1);
    expect(a.last('roomUpdate')!.players).toHaveLength(2);
    server.tick();
    server.tick();
    expect(a.snapshot!.match.phase).toBe('countdown');
    expect(b.snapshot!.players).toHaveLength(2);
  });

  it('room codes are case-insensitive', () => {
    const server = createTestServer();
    const a = new TestClient(server);
    const b = new TestClient(server);
    a.send({ type: 'createRoom', name: 'A' });
    b.sendRaw(JSON.stringify({ type: 'joinRoom', code: a.roomCode.toLowerCase(), name: 'B' }));
    expect(b.last('roomJoined')).toBeDefined();
  });

  it('rejects an unknown room code', () => {
    const b = new TestClient(createTestServer());
    b.send({ type: 'joinRoom', code: 'ZZZZ', name: 'B' });
    expect(b.last('error')!.code).toBe('room_not_found');
    expect(b.last('roomJoined')).toBeUndefined();
  });

  it('rejects a third player (room full)', () => {
    const { server, a } = createMatch();
    const c = new TestClient(server);
    c.send({ type: 'joinRoom', code: a.roomCode, name: 'C' });
    expect(c.last('error')!.code).toBe('room_full');
  });

  it('rejects joining a second room while in one', () => {
    const server = createTestServer();
    const a = new TestClient(server);
    a.send({ type: 'createRoom', name: 'A' });
    a.send({ type: 'createRoom', name: 'A' });
    expect(a.last('error')!.code).toBe('already_in_room');
    expect(server.lobby.roomCount).toBe(1);
  });

  it('quickMatch pairs two players, a third gets a new room', () => {
    const server = createTestServer();
    const [a, b, c] = [new TestClient(server), new TestClient(server), new TestClient(server)];
    for (const client of [a, b, c]) client.send({ type: 'quickMatch', name: 'Q' });
    expect(a.roomCode).toBe(b.roomCode);
    expect(c.roomCode).not.toBe(a.roomCode);
    expect(server.lobby.roomCount).toBe(2);
  });

  it('createRoom uses the map the creator picked', () => {
    const server = new GameServer({ matchConfig: FAST_MATCH_CONFIG });
    const a = new TestClient(server);
    const b = new TestClient(server);
    a.send({ type: 'createRoom', name: 'A', mapId: 'reaktor' });
    b.send({ type: 'createRoom', name: 'B' });
    expect(a.last('roomJoined')!.mapId).toBe('reaktor');
    expect(b.last('roomJoined')!.mapId).toBe(DEFAULT_MAP_ID);
    b.sendRaw('{"type":"leaveRoom"}');
    b.sendRaw('{"type":"createRoom","name":"B","mapId":"does-not-exist"}');
    expect(b.last('error')!.code).toBe('bad_message');
  });

  it('quick-match rooms take turns through the map rotation', () => {
    const server = new GameServer({ matchConfig: FAST_MATCH_CONFIG });
    const seen: string[] = [];
    for (let i = 0; i < MAP_ROTATION.length * 2; i++) {
      const a = new TestClient(server);
      const b = new TestClient(server);
      a.send({ type: 'quickMatch', name: 'A' });
      b.send({ type: 'quickMatch', name: 'B' });
      expect(b.roomCode).toBe(a.roomCode);
      seen.push(a.last('roomJoined')!.mapId);
    }
    expect(seen).toEqual([...MAP_ROTATION, ...MAP_ROTATION]);
  });

  it('a server started with a fixed map uses it for every room', () => {
    const server = new GameServer({ matchConfig: FAST_MATCH_CONFIG, mapId: 'daecher' });
    const a = new TestClient(server);
    a.send({ type: 'createRoom', name: 'A', mapId: 'reaktor' });
    expect(a.last('roomJoined')!.mapId).toBe('daecher');
    expect(() => new GameServer({ mapId: 'nope' })).toThrow();
  });

  it('quickMatch never joins a private room', () => {
    const server = createTestServer();
    const a = new TestClient(server);
    const b = new TestClient(server);
    a.send({ type: 'createRoom', name: 'A' });
    b.send({ type: 'quickMatch', name: 'B' });
    expect(b.roomCode).not.toBe(a.roomCode);
  });

  it('when a player leaves, the other one goes back to practice mode', () => {
    const { server, a, b } = createMatch();
    b.send({ type: 'leaveRoom' });
    expect(b.last('roomLeft')).toBeDefined();
    expect(a.last('roomUpdate')!.players).toHaveLength(1);
    server.tick();
    server.tick();
    expect(a.snapshot!.match.phase).toBe('waiting');
    expect(a.snapshot!.players).toHaveLength(1);
  });

  it('leaving frees the seat at once, and empty rooms are deleted', () => {
    const { server, a, b } = createMatch();
    expect(server.lobby.playerCount).toBe(2);
    a.send({ type: 'leaveRoom' });
    expect(server.lobby.playerCount).toBe(1);
    b.send({ type: 'leaveRoom' });
    expect(server.lobby.roomCount).toBe(0);
  });

  it('a freed seat can be taken by a new player', () => {
    const { server, a, b } = createMatch();
    a.send({ type: 'leaveRoom' });
    const c = new TestClient(server);
    c.send({ type: 'joinRoom', code: b.roomCode, name: 'C' });
    expect(c.last('roomJoined')!.slot).toBe(0);
    server.tick();
    server.tick();
    expect(c.snapshot!.match.phase).toBe('countdown');
  });
});
