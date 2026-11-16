/**
 * Turning messages into text and back.
 * Client -> server messages are strictly validated (never trust the client).
 */
import { sanitizeInput } from '../input';
import { isMapId } from '../maps';
import type { ClientMessage, ServerMessage } from './messages';

export const MAX_NAME_LENGTH = 16;
export const ROOM_CODE_LENGTH = 4;
/** Reconnect tokens are hex strings made by the server. */
const TOKEN_PATTERN = /^[0-9a-f]{16,64}$/;
/** Largest message the server accepts, in characters. */
export const MAX_CLIENT_MESSAGE_LENGTH = 512;

export function encodeMessage(message: ClientMessage | ServerMessage): string {
  return JSON.stringify(message);
}

/** Trim a player name and remove anything that is not a normal visible character. */
export function sanitizeName(raw: unknown): string {
  if (typeof raw !== 'string') return 'Player';
  const cleaned = raw.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, MAX_NAME_LENGTH);
  return cleaned.length > 0 ? cleaned : 'Player';
}

function parseRoomCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return /^[A-Z0-9]+$/.test(code) && code.length === ROOM_CODE_LENGTH ? code : null;
}

/** Parse and validate a message from a client. Returns null if anything is wrong. */
export function parseClientMessage(text: string): ClientMessage | null {
  if (typeof text !== 'string' || text.length > MAX_CLIENT_MESSAGE_LENGTH) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const msg = raw as Record<string, unknown>;

  switch (msg.type) {
    case 'createRoom':
      if (msg.mapId === undefined) return { type: 'createRoom', name: sanitizeName(msg.name) };
      return isMapId(msg.mapId) ? { type: 'createRoom', name: sanitizeName(msg.name), mapId: msg.mapId } : null;
    case 'quickMatch':
      return { type: 'quickMatch', name: sanitizeName(msg.name) };
    case 'joinRoom': {
      const code = parseRoomCode(msg.code);
      return code ? { type: 'joinRoom', code, name: sanitizeName(msg.name) } : null;
    }
    case 'rejoin': {
      const code = parseRoomCode(msg.code);
      const tokenOk = typeof msg.token === 'string' && TOKEN_PATTERN.test(msg.token);
      return code && tokenOk ? { type: 'rejoin', code, token: msg.token as string } : null;
    }
    case 'leaveRoom':
      return { type: 'leaveRoom' };
    case 'rematch':
      return { type: 'rematch' };
    case 'input': {
      const cmd = sanitizeInput(msg.cmd);
      return cmd ? { type: 'input', cmd } : null;
    }
    case 'ping':
      return typeof msg.t === 'number' && Number.isFinite(msg.t) ? { type: 'ping', t: msg.t } : null;
    default:
      return null;
  }
}

/** Parse a message from the server. The server is trusted, so only the shape is checked. */
export function parseServerMessage(text: string): ServerMessage | null {
  try {
    const raw = JSON.parse(text) as ServerMessage;
    return typeof raw === 'object' && raw !== null && typeof raw.type === 'string' ? raw : null;
  } catch {
    return null;
  }
}
