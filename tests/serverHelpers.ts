/**
 * Helpers for testing the server without any network: a TestClient is wired directly
 * (synchronously) to a GameServer and records every message it receives.
 */
import { GameServer } from '../src/server/gameServer';
import type { InputCmd } from '../src/shared/input';
import { FAST_MATCH_CONFIG } from '../src/shared/match/matchConfig';
import { encodeMessage, parseServerMessage } from '../src/shared/protocol/codec';
import type { ClientMessage, ServerMessage, SnapshotMessage } from '../src/shared/protocol/messages';
import type { Transport } from '../src/shared/protocol/transport';

type MessageOfType<T extends ServerMessage['type']> = Extract<ServerMessage, { type: T }>;

export class TestClient {
  readonly received: ServerMessage[] = [];
  closedByServer = false;
  private readonly serverEnd: Transport;
  private seq = 0;

  constructor(server: GameServer) {
    this.serverEnd = {
      send: (data) => {
        const message = parseServerMessage(data);
        if (message) this.received.push(message);
      },
      close: () => {
        this.closedByServer = true;
      },
      onMessage: () => {},
      onClose: () => {},
    };
    server.attach(this.serverEnd);
  }

  send(message: ClientMessage): void {
    this.serverEnd.onMessage(encodeMessage(message));
  }

  /** Send arbitrary text (to test how the server handles garbage). */
  sendRaw(text: string): void {
    this.serverEnd.onMessage(text);
  }

  sendInput(sample: Partial<InputCmd> = {}): void {
    this.seq++;
    this.send({
      type: 'input',
      cmd: { seq: this.seq, moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons: 0, viewTick: 0, ...sample },
    });
  }

  disconnect(): void {
    this.serverEnd.onClose();
  }

  all<T extends ServerMessage['type']>(type: T): MessageOfType<T>[] {
    return this.received.filter((m): m is MessageOfType<T> => m.type === type);
  }

  last<T extends ServerMessage['type']>(type: T): MessageOfType<T> | undefined {
    return this.all(type).at(-1);
  }

  get snapshot(): SnapshotMessage | undefined {
    return this.last('snapshot');
  }

  /** The reconnect token from the last `roomJoined`. */
  get token(): string {
    const joined = this.last('roomJoined');
    if (!joined) throw new Error('client is not in a room');
    return joined.token;
  }

  get roomCode(): string {
    const joined = this.last('roomJoined');
    if (!joined) throw new Error('client is not in a room');
    return joined.code;
  }
}

/** Test server: short timers, always the simple 'arena' map (tests rely on its coordinates). */
export function createTestServer(): GameServer {
  return new GameServer({ matchConfig: FAST_MATCH_CONFIG, mapId: 'arena' });
}

/** Two clients in the same room, match started. */
export function createMatch(server = createTestServer()) {
  const a = new TestClient(server);
  const b = new TestClient(server);
  a.send({ type: 'createRoom', name: 'A' });
  b.send({ type: 'joinRoom', code: a.roomCode, name: 'B' });
  return { server, a, b };
}

/** Tick the server until the room of `client` is in the 'playing' phase. */
export function tickUntilPlaying(server: GameServer, client: TestClient): void {
  for (let i = 0; i < 1000; i++) {
    if (client.snapshot?.match.phase === 'playing') return;
    server.tick();
  }
  throw new Error('match never reached the playing phase');
}
