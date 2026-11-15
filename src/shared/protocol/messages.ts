/**
 * Every message that travels between client and server. Messages are JSON objects with
 * a `type` field. To add a message: add it to the union here, validate it in codec.ts
 * (client -> server only), and handle it (server: messageRouter.ts, client: gameClient.ts).
 */
import type { InputCmd } from '../input';
import type { GameEvent } from '../sim/events';
import type { PlayerState } from '../sim/playerState';
import type { MatchState } from '../sim/world';

// ---------- client -> server ----------

export type ClientMessage =
  | { type: 'createRoom'; name: string }
  | { type: 'joinRoom'; code: string; name: string }
  | { type: 'quickMatch'; name: string }
  | { type: 'leaveRoom' }
  | { type: 'input'; cmd: InputCmd }
  | { type: 'ping'; t: number };

// ---------- server -> client ----------

export interface RoomPlayerInfo {
  slot: number;
  name: string;
}

export type ErrorCode = 'bad_message' | 'room_not_found' | 'room_full' | 'already_in_room';

export interface SnapshotMessage {
  type: 'snapshot';
  /** Server tick this snapshot was taken at. */
  tick: number;
  /** Sequence number of the last input of the RECEIVING player that the server has simulated. */
  ack: number;
  /**
   * True if, since the previous snapshot, the receiving player was simulated from exactly
   * one fresh input per tick and nothing else touched it. In that case the client's
   * prediction MUST match exactly - a mismatch is a real desync (a bug).
   */
  clean: boolean;
  players: PlayerState[];
  match: MatchState;
  events: GameEvent[];
}

export type ServerMessage =
  | { type: 'welcome'; protocol: number; tickRate: number }
  | { type: 'roomJoined'; code: string; slot: number; mapId: string; players: RoomPlayerInfo[] }
  | { type: 'roomUpdate'; players: RoomPlayerInfo[] }
  | { type: 'roomLeft' }
  | SnapshotMessage
  | { type: 'pong'; t: number }
  | { type: 'error'; code: ErrorCode; message: string };
