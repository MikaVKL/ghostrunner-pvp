/**
 * One game room: up to two players and their world. The room owns the authoritative
 * simulation. It knows nothing about WebSockets - it only talks to Session objects.
 *
 * Reconnect: a seat whose client lost its connection stays reserved for
 * `matchConfig.reconnectTicks`. Meanwhile the match is paused. With the secret token from
 * `roomJoined` the client can take the seat again (rejoin).
 */
import { MAX_PLAYERS_PER_ROOM, SNAPSHOT_EVERY_TICKS } from '../../shared/config';
import type { InputCmd } from '../../shared/input';
import { enterWaiting, pauseMatch, resumeMatch, startMatch, voteRematch } from '../../shared/match/lifecycle';
import { encodeMessage } from '../../shared/protocol/codec';
import type { RoomPlayerInfo, SnapshotMessage } from '../../shared/protocol/messages';
import type { GameEvent } from '../../shared/sim/events';
import { stepWorld, type InputsBySlot } from '../../shared/sim/stepWorld';
import { addPlayer, createWorld, removePlayer, type SimContext } from '../../shared/sim/world';
import type { Session } from '../net/session';
import { InputQueue } from './inputQueue';
import { createSeat, type Seat } from './seat';

export class Room {
  readonly world;
  private seats: Seat[] = [];
  private pendingEvents: GameEvent[] = [];

  constructor(
    readonly code: string,
    private readonly ctx: SimContext,
    /** Public rooms can be filled by quick match. */
    readonly isPublic: boolean,
    private readonly createToken: () => string,
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

  /** True if a seat is reserved for a player who lost its connection. */
  get hasDisconnectedSeat(): boolean {
    return this.seats.some((s) => s.session === null);
  }

  /** Add a player. The caller must check `isFull` first. */
  join(session: Session): void {
    const slot = this.seats.some((s) => s.slot === 0) ? 1 : 0;
    const seat = createSeat(slot, session, this.createToken());
    this.seats.push(seat);
    session.room = this;
    addPlayer(this.world, slot, this.ctx.map);
    if (this.isFull) startMatch(this.world, this.ctx);
    if (this.hasDisconnectedSeat) pauseMatch(this.world, this.ctx.matchConfig.reconnectTicks);
    this.markAllDisturbed();
    this.sendRoomJoined(seat);
    this.broadcastRoomUpdate();
  }

  /** The player leaves for good (leave button, kicked, or reconnect time ran out). */
  leave(session: Session): void {
    const seat = this.seats.find((s) => s.session === session);
    if (!seat) return;
    session.room = null;
    session.send({ type: 'roomLeft' });
    this.removeSeat(seat);
  }

  /** The connection of a player broke. Its seat stays reserved; the match is paused. */
  disconnect(session: Session): void {
    const seat = this.seats.find((s) => s.session === session);
    if (!seat) return;
    session.room = null;
    seat.session = null;
    seat.disconnectedTicks = 0;
    pauseMatch(this.world, this.ctx.matchConfig.reconnectTicks);
    this.markAllDisturbed();
    this.broadcastRoomUpdate();
  }

  /** A client with the right token takes its reserved seat again. Returns false if refused. */
  rejoin(session: Session, token: string): boolean {
    const seat = this.seats.find((s) => s.session === null && s.token === token);
    if (!seat) return false;
    seat.session = session;
    seat.inputs = new InputQueue(); // the client starts counting its inputs from 1 again
    session.room = this;
    session.name = seat.name;
    if (!this.hasDisconnectedSeat) resumeMatch(this.world, this.ctx);
    this.markAllDisturbed();
    this.sendRoomJoined(seat);
    this.broadcastRoomUpdate();
    return true;
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
    this.dropExpiredSeats();
    const inputs: InputsBySlot = {};
    for (const seat of this.seats) {
      if (!seat.session) continue; // disconnected: neutral input
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

  /** Give up seats whose player did not come back in time. */
  private dropExpiredSeats(): void {
    for (const seat of [...this.seats]) {
      if (seat.session) continue;
      seat.disconnectedTicks++;
      if (seat.disconnectedTicks > this.ctx.matchConfig.reconnectTicks) this.removeSeat(seat);
    }
  }

  private removeSeat(seat: Seat): void {
    this.seats = this.seats.filter((s) => s !== seat);
    removePlayer(this.world, seat.slot);
    enterWaiting(this.world, this.ctx);
    this.markAllDisturbed();
    this.broadcastRoomUpdate();
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
      seat.session?.sendRaw(encodeMessage(snapshot));
      seat.disturbed = false;
    }
    this.pendingEvents = [];
  }

  /** Any change to the world made outside of stepWorld must call this. */
  private markAllDisturbed(): void {
    for (const seat of this.seats) seat.disturbed = true;
  }

  private playerInfos(): RoomPlayerInfo[] {
    return this.seats.map((s) => ({ slot: s.slot, name: s.name, connected: s.session !== null }));
  }

  private sendRoomJoined(seat: Seat): void {
    seat.session?.send({
      type: 'roomJoined',
      code: this.code,
      slot: seat.slot,
      mapId: this.ctx.map.id,
      token: seat.token,
      roundsToWin: this.ctx.matchConfig.roundsToWin,
      players: this.playerInfos(),
    });
  }

  private broadcastRoomUpdate(): void {
    const players = this.playerInfos();
    for (const seat of this.seats) seat.session?.send({ type: 'roomUpdate', players });
  }
}
