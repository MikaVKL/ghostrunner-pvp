/**
 * A seat = one player's place in a room: who sits there, its connection, its input
 * queue and its secret reconnect token.
 */
import type { Session } from '../net/session';
import { InputQueue } from './inputQueue';

export interface Seat {
  slot: number;
  name: string;
  /** Null while the client is disconnected and the seat is reserved for it. */
  session: Session | null;
  /** Secret for taking this seat again after a connection loss. */
  token: string;
  /** How long the seat has been without a connection. */
  disconnectedTicks: number;
  inputs: InputQueue;
  /** True if something unpredictable happened to this player since the last snapshot. */
  disturbed: boolean;
}

export function createSeat(slot: number, session: Session, token: string): Seat {
  return {
    slot,
    name: session.name,
    session,
    token,
    disconnectedTicks: 0,
    inputs: new InputQueue(),
    disturbed: true,
  };
}
