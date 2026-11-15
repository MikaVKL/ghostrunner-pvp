/**
 * The lobby keeps track of all rooms and puts players into them:
 * - createRoom: new private room, the creator shares the code with a friend
 * - joinRoom:   enter an existing room by code
 * - quickMatch: join any public room that is waiting for an opponent, or open a new one
 */
import type { ErrorCode } from '../../shared/protocol/messages';
import type { SimContext } from '../../shared/sim/world';
import { Room } from '../game/room';
import type { Session } from '../net/session';
import { generateUniqueRoomCode } from './roomCodes';

export class Lobby {
  private readonly rooms = new Map<string, Room>();

  constructor(
    private readonly ctx: SimContext,
    private readonly random: () => number = Math.random,
  ) {}

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

  createRoom(session: Session, isPublic = false): void {
    if (this.rejectIfInRoom(session)) return;
    const code = generateUniqueRoomCode((c) => this.rooms.has(c), this.random);
    const room = new Room(code, this.ctx, isPublic);
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
    this.createRoom(session, true);
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
