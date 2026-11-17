/**
 * The lobby keeps track of all rooms and puts players into them:
 * - createRoom: new private room, the creator shares the code with a friend
 * - joinRoom:   enter an existing room by code
 * - quickMatch: join any public room that is waiting for an opponent, or open a new one
 * - rejoin:     take a reserved seat again after a connection loss
 */
import { DEFAULT_MAP_ID, getMap, MAP_ROTATION } from '../../shared/maps';
import { DEFAULT_MODE_ID, getMode, matchConfigForMode, type ModeId } from '../../shared/match/gameModes';
import type { MatchConfig } from '../../shared/match/matchConfig';
import type { ErrorCode } from '../../shared/protocol/messages';
import { Room } from '../game/room';
import type { Session } from '../net/session';
import { generateUniqueRoomCode } from './roomCodes';

/**
 * A secret, unguessable token for reconnecting (not part of the simulation).
 * Uses the Web Crypto API, which exists in Node AND in browsers - the server core must
 * also run inside the browser for the solo mode (see src/solo/).
 */
function createToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export interface LobbyOptions {
  matchConfig: MatchConfig;
  /**
   * True: rounds to win, round limit and round length come from the room's game mode.
   * False: `matchConfig` decides them (tests run short matches in every mode).
   */
  useModeRounds: boolean;
  /**
   * If set, EVERY room uses this map (server started with MAP=...). Otherwise private
   * rooms use the map their creator picked and quick-match rooms rotate through MAP_ROTATION.
   */
  forcedMapId?: string;
  /** Rooms record replays of their matches (see Room.replay). */
  recordReplays?: boolean;
}

export class Lobby {
  private readonly rooms = new Map<string, Room>();
  /** Counts quick-match rooms, to rotate through the maps. */
  private publicRoomsCreated = 0;

  constructor(
    private readonly options: LobbyOptions,
    private readonly random: () => number = Math.random,
  ) {
    if (options.forcedMapId) getMap(options.forcedMapId); // fail early on a typo
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  get playerCount(): number {
    let count = 0;
    for (const room of this.rooms.values()) count += room.playerCount;
    return count;
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  /** New private room. Map and mode are the creator's choice (already validated by the codec). */
  createRoom(session: Session, mapId?: string, modeId: ModeId = DEFAULT_MODE_ID): void {
    if (this.rejectIfInRoom(session)) return;
    this.openRoom(session, this.options.forcedMapId ?? mapId ?? DEFAULT_MAP_ID, modeId, false);
  }

  private openRoom(session: Session, mapId: string, modeId: ModeId, isPublic: boolean): void {
    const code = generateUniqueRoomCode((c) => this.rooms.has(c), this.random);
    const mode = getMode(modeId);
    const matchConfig = matchConfigForMode(this.options.matchConfig, mode, this.options.useModeRounds);
    const ctx = { map: getMap(mapId), matchConfig, mode };
    const room = new Room(code, ctx, isPublic, createToken, this.options.recordReplays ?? false);
    this.rooms.set(code, room);
    room.join(session);
  }

  joinRoom(session: Session, code: string): void {
    if (this.rejectIfInRoom(session)) return;
    const room = this.rooms.get(code);
    if (!room) return this.sendError(session, 'room_not_found', `Room ${code} does not exist.`);
    if (room.isFull) return this.sendError(session, 'room_full', `Room ${code} is full.`);
    room.join(session);
  }

  /** Join a waiting public room of the same mode, or open one. */
  quickMatch(session: Session, modeId: ModeId = DEFAULT_MODE_ID): void {
    if (this.rejectIfInRoom(session)) return;
    for (const room of this.rooms.values()) {
      const free = room.isPublic && !room.isFull && !room.hasDisconnectedSeat;
      if (free && room.modeId === modeId) return room.join(session);
    }
    const rotated = MAP_ROTATION[this.publicRoomsCreated++ % MAP_ROTATION.length];
    this.openRoom(session, this.options.forcedMapId ?? rotated, modeId, true);
  }

  /** Take a reserved seat again after a connection loss. */
  rejoin(session: Session, code: string, token: string): void {
    if (this.rejectIfInRoom(session)) return;
    const ok = this.rooms.get(code)?.rejoin(session, token) ?? false;
    if (!ok) this.sendError(session, 'rejoin_failed', 'The seat is no longer available.');
  }

  /** Remove the session from its room for good (if any). Empty rooms are deleted. */
  leave(session: Session): void {
    const room = session.room;
    if (!room) return;
    room.leave(session);
    if (room.isEmpty) this.rooms.delete(room.code);
  }

  /** The connection broke: keep the seat reserved for a while (see Room.disconnect). */
  disconnect(session: Session): void {
    session.room?.disconnect(session);
  }

  /** Advance every room by one tick. Rooms whose last player gave up are deleted. */
  tick(): void {
    for (const room of this.rooms.values()) {
      room.tick();
      if (room.isEmpty) this.rooms.delete(room.code);
    }
  }

  private rejectIfInRoom(session: Session): boolean {
    if (!session.room) return false;
    this.sendError(session, 'already_in_room', 'Leave the current room first.');
    return true;
  }

  private sendError(session: Session, code: ErrorCode, message: string): void {
    session.send({ type: 'error', code, message });
  }
}
