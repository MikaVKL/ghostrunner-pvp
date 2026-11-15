/**
 * The lobby keeps track of all rooms and puts players into them:
 * - createRoom: new private room, the creator shares the code with a friend
 * - joinRoom:   enter an existing room by code
 * - quickMatch: join any public room that is waiting for an opponent, or open a new one
 */
import { DEFAULT_MAP_ID, getMap, MAP_ROTATION } from '../../shared/maps';
import type { MatchConfig } from '../../shared/match/matchConfig';
import type { ErrorCode } from '../../shared/protocol/messages';
import { Room } from '../game/room';
import type { Session } from '../net/session';
import { generateUniqueRoomCode } from './roomCodes';

export interface LobbyOptions {
  matchConfig: MatchConfig;
  /**
   * If set, EVERY room uses this map (server started with MAP=...). Otherwise private
   * rooms use the map their creator picked and quick-match rooms rotate through MAP_ROTATION.
   */
  forcedMapId?: string;
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

  /** New private room. `mapId` is the creator's choice (already validated by the codec). */
  createRoom(session: Session, mapId?: string): void {
    if (this.rejectIfInRoom(session)) return;
    this.openRoom(session, this.options.forcedMapId ?? mapId ?? DEFAULT_MAP_ID, false);
  }

  private openRoom(session: Session, mapId: string, isPublic: boolean): void {
    const code = generateUniqueRoomCode((c) => this.rooms.has(c), this.random);
    const ctx = { map: getMap(mapId), matchConfig: this.options.matchConfig };
    const room = new Room(code, ctx, isPublic);
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

  quickMatch(session: Session): void {
    if (this.rejectIfInRoom(session)) return;
    for (const room of this.rooms.values()) {
      if (room.isPublic && !room.isFull) return room.join(session);
    }
    const rotated = MAP_ROTATION[this.publicRoomsCreated++ % MAP_ROTATION.length];
    this.openRoom(session, this.options.forcedMapId ?? rotated, true);
  }

  /** Remove the session from its room (if any). Empty rooms are deleted. */
  leave(session: Session): void {
    const room = session.room;
    if (!room) return;
    room.leave(session);
    if (room.isEmpty) this.rooms.delete(room.code);
  }

  /** Advance every room by one tick. */
  tick(): void {
    for (const room of this.rooms.values()) room.tick();
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
