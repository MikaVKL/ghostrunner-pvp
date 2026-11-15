/**
 * One connected client, as seen by the server.
 */
import { encodeMessage } from '../../shared/protocol/codec';
import type { ServerMessage } from '../../shared/protocol/messages';
import type { Transport } from '../../shared/protocol/transport';
import type { Room } from '../game/room';

let nextSessionId = 1;

export class Session {
  readonly id = nextSessionId++;
  name = 'Player';
  /** The room this client is in, or null while in the lobby. */
  room: Room | null = null;
  /** Messages received in the current rate-limit window. */
  messageCount = 0;
  closed = false;

  constructor(private readonly transport: Transport) {}

  send(message: ServerMessage): void {
    this.sendRaw(encodeMessage(message));
  }

  /** Send already-encoded text (lets the room encode a snapshot once per player). */
  sendRaw(data: string): void {
    if (this.closed) return;
    this.transport.send(data);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.transport.close();
  }
}
