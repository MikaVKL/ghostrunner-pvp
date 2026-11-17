/**
 * The game server core, independent of any real network or timer:
 * - `attach(transport)` registers a new client connection
 * - `tick()` advances all rooms by one simulation step
 *
 * startServer.ts wires this to real WebSockets and a real 60 Hz timer.
 * Tests wire it to a fake in-memory network and call tick() by hand.
 */
import { PROTOCOL_VERSION, TICK_RATE } from '../shared/config';
import { DEFAULT_MATCH_CONFIG, type MatchConfig } from '../shared/match/matchConfig';
import { parseClientMessage } from '../shared/protocol/codec';
import type { Transport } from '../shared/protocol/transport';
import { Metrics } from './game/metrics';
import { Lobby } from './lobby/lobby';
import { routeMessage } from './net/messageRouter';
import { Session } from './net/session';

/** A client sending more messages than this per second is disconnected (normal is ~61). */
const MAX_MESSAGES_PER_SECOND = 240;

export interface GameServerOptions {
  matchConfig?: MatchConfig;
  /** Force this map for every room (otherwise players choose / quick match rotates). */
  mapId?: string;
  /** Record a replay of every match (solo mode: yes; online server: off, nothing reads it yet). */
  recordReplays?: boolean;
}

export interface ServerStats {
  rooms: number;
  players: number;
  connections: number;
  badMessages: number;
  errors: number;
  lastError: string;
  tick: ReturnType<Metrics['tickStats']>;
}

export class GameServer {
  readonly lobby: Lobby;
  readonly metrics = new Metrics();
  private readonly sessions = new Set<Session>();
  private tickCount = 0;

  constructor(options: GameServerOptions = {}) {
    this.lobby = new Lobby({
      matchConfig: options.matchConfig ?? DEFAULT_MATCH_CONFIG,
      forcedMapId: options.mapId,
      recordReplays: options.recordReplays ?? false,
    });
  }

  /** Register a new client connection. */
  attach(transport: Transport): Session {
    const session = new Session(transport);
    this.sessions.add(session);
    transport.onMessage = (data) => this.handleMessage(session, data);
    transport.onClose = () => this.handleClose(session);
    session.send({ type: 'welcome', protocol: PROTOCOL_VERSION, tickRate: TICK_RATE });
    return session;
  }

  /** One simulation step for every room. Never throws (errors are counted in metrics). */
  tick(): void {
    const start = performance.now();
    try {
      this.lobby.tick();
    } catch (error) {
      this.metrics.recordError(error);
    }
    this.tickCount++;
    if (this.tickCount % TICK_RATE === 0) {
      for (const session of this.sessions) session.messageCount = 0;
    }
    this.metrics.recordTick(performance.now() - start);
  }

  stats(): ServerStats {
    return {
      rooms: this.lobby.roomCount,
      players: this.lobby.playerCount,
      connections: this.sessions.size,
      badMessages: this.metrics.badMessages,
      errors: this.metrics.errors,
      lastError: this.metrics.lastError,
      tick: this.metrics.tickStats(),
    };
  }

  private handleMessage(session: Session, data: string): void {
    session.messageCount++;
    if (session.messageCount > MAX_MESSAGES_PER_SECOND) {
      // Kicked for flooding: no seat reservation, the player is out.
      this.lobby.leave(session);
      session.close();
      this.handleClose(session);
      return;
    }
    const message = parseClientMessage(data);
    if (!message) {
      this.metrics.badMessages++;
      session.send({ type: 'error', code: 'bad_message', message: 'Invalid message.' });
      return;
    }
    try {
      routeMessage(this.lobby, session, message);
    } catch (error) {
      this.metrics.recordError(error);
    }
  }

  private handleClose(session: Session): void {
    if (!this.sessions.delete(session)) return;
    session.closed = true;
    this.lobby.disconnect(session);
  }
}
