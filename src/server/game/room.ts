/**
 * One game room: up to two players and their world. The room owns the authoritative
 * simulation. It knows nothing about WebSockets - it only talks to Session objects.
 */
import { MAX_PLAYERS_PER_ROOM, SNAPSHOT_EVERY_TICKS } from '../../shared/config';
import type { InputCmd } from '../../shared/input';
import { enterWaiting, startMatch, voteRematch } from '../../shared/match/lifecycle';
import { encodeMessage } from '../../shared/protocol/codec';
import type { RoomPlayerInfo, SnapshotMessage } from '../../shared/protocol/messages';
import type { GameEvent } from '../../shared/sim/events';
import { stepWorld, type InputsBySlot } from '../../shared/sim/stepWorld';
import { addPlayer, createWorld, removePlayer, type SimContext } from '../../shared/sim/world';
import type { Session } from '../net/session';
import { InputQueue } from './inputQueue';

/** A player's place in the room. */
interface Seat {
  slot: number;
  session: Session;
  inputs: InputQueue;
  /** True if something unpredictable happened to this player since the last snapshot. */
  disturbed: boolean;
}

export class Room {
  readonly world;
  private seats: Seat[] = [];
  private pendingEvents: GameEvent[] = [];

  constructor(
    readonly code: string,
    private readonly ctx: SimContext,
    /** Public rooms can be filled by quick match. */
    readonly isPublic: boolean,
  ) {
    this.world = createWorld(ctx.map.id);
  }

  get isFull(): boolean {
    return this.seats.length >= MAX_PLAYERS_PER_ROOM;
  }

  get isEmpty(): boolean {
    return this.seats.length === 0;
  }

  get playerCount(): number {
    return this.seats.length;
  }

  /** Add a player. The caller must check `isFull` first. */
  join(session: Session): void {
    const slot = this.seats.some((s) => s.slot === 0) ? 1 : 0;
    this.seats.push({ slot, session, inputs: new InputQueue(), disturbed: true });
    session.room = this;
    addPlayer(this.world, slot, this.ctx.map);
    if (this.isFull) startMatch(this.world, this.ctx);
    this.markAllDisturbed();

    session.send({
      type: 'roomJoined',
      code: this.code,
      slot,
      mapId: this.ctx.map.id,
      players: this.playerInfos(),
    });
    this.broadcastRoomUpdate();
  }

  leave(session: Session): void {
    const seat = this.seats.find((s) => s.session === session);
    if (!seat) return;
    this.seats = this.seats.filter((s) => s !== seat);
    session.room = null;
    removePlayer(this.world, seat.slot);
    enterWaiting(this.world, this.ctx);
    this.markAllDisturbed();
    session.send({ type: 'roomLeft' });
    this.broadcastRoomUpdate();
  }

  handleInput(session: Session, cmd: InputCmd): void {
    this.seats.find((s) => s.session === session)?.inputs.push(cmd);
  }

  /** A player asks for a rematch after the match has ended. */
  handleRematch(session: Session): void {
    const seat = this.seats.find((s) => s.session === session);
    if (seat && voteRematch(this.world, seat.slot)) this.markAllDisturbed();
  }

  /** Advance the room by one simulation tick. Called by the server's tick loop. */
  tick(): void {
    const inputs: InputsBySlot = {};
    for (const seat of this.seats) {
      const next = seat.inputs.next();
      inputs[seat.slot] = next.input ?? undefined;
      if (!next.predictable) seat.disturbed = true;
    }

    const result = stepWorld(this.world, inputs, this.ctx);
    this.pendingEvents.push(...result.events);
    for (const seat of this.seats) {
      if (result.disturbed.includes(seat.slot)) seat.disturbed = true;
    }

    if (this.world.tick % SNAPSHOT_EVERY_TICKS === 0) this.sendSnapshots();
  }

  private sendSnapshots(): void {
    for (const seat of this.seats) {
      const snapshot: SnapshotMessage = {
        type: 'snapshot',
        tick: this.world.tick,
        ack: seat.inputs.lastProcessedSeq,
        clean: !seat.disturbed,
        players: this.world.players,
        match: this.world.match,
        events: this.pendingEvents,
      };
      seat.session.sendRaw(encodeMessage(snapshot));
      seat.disturbed = false;
    }
    this.pendingEvents = [];
  }

  /** Any change to the world made outside of stepWorld must call this. */
  private markAllDisturbed(): void {
    for (const seat of this.seats) seat.disturbed = true;
  }

  private playerInfos(): RoomPlayerInfo[] {
    return this.seats.map((s) => ({ slot: s.slot, name: s.session.name }));
  }

  private broadcastRoomUpdate(): void {
    const players = this.playerInfos();
    for (const seat of this.seats) seat.session.send({ type: 'roomUpdate', players });
  }
}
