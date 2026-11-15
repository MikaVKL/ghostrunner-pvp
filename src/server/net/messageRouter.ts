/**
 * Decides what to do with each (already validated) message from a client.
 * To handle a new message type, add a case here.
 */
import type { ClientMessage } from '../../shared/protocol/messages';
import { assertNever } from '../../shared/util/assertNever';
import type { Lobby } from '../lobby/lobby';
import type { Session } from './session';

export function routeMessage(lobby: Lobby, session: Session, message: ClientMessage): void {
  switch (message.type) {
    case 'createRoom':
      session.name = message.name;
      lobby.createRoom(session);
      return;
    case 'joinRoom':
      session.name = message.name;
      lobby.joinRoom(session, message.code);
      return;
    case 'quickMatch':
      session.name = message.name;
      lobby.quickMatch(session);
      return;
    case 'leaveRoom':
      lobby.leave(session);
      return;
    case 'input':
      session.room?.handleInput(session, message.cmd);
      return;
    case 'ping':
      session.send({ type: 'pong', t: message.t });
      return;
    default:
      assertNever(message);
  }
}
