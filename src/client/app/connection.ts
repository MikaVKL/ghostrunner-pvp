/**
 * Opening the connection to the game server - and getting it back when it breaks.
 *
 * - `openTransport`  one connection attempt (with the optional fake lag from the URL)
 * - `reconnectLoop`  after a connection loss: try again once per second for a while
 * - seat storage     remembers room code + secret token in sessionStorage, so even a
 *                    page reload can take the old seat again
 */
import type { GameClient, RoomInfo } from '../../netcode/gameClient';
import { withLag } from '../../netcode/lagTransport';
import { connectWebSocket } from '../../netcode/webSocketTransport';
import type { Transport } from '../../shared/protocol/transport';

const SEAT_STORAGE_KEY = 'seat';
const RETRY_EVERY_MS = 1000;
/** Give up after this many attempts (a bit longer than the server keeps the seat). */
const MAX_ATTEMPTS = 25;

export interface ConnectionOptions {
  /** Artificial one-way delay in ms (URL option ?lag=). */
  lagMs: number;
  jitterMs: number;
}

/** Same host that served the page. In dev, Vite forwards /ws to the game server. */
function serverUrl(): string {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${location.host}/ws`;
}

export async function openTransport(options: ConnectionOptions): Promise<Transport> {
  return withLag(await connectWebSocket(serverUrl()), options.lagMs, options.jitterMs);
}

/**
 * Keep trying to reconnect. Resolves true once `client` has a working connection again
 * (it then asks for its old seat by itself), false if the server stayed unreachable.
 */
export async function reconnectLoop(client: GameClient, options: ConnectionOptions): Promise<boolean> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, RETRY_EVERY_MS));
    try {
      client.reconnect(await openTransport(options));
      return true;
    } catch {
      // Server still unreachable - try again.
    }
  }
  return false;
}

export function rememberSeat(room: RoomInfo): void {
  sessionStorage.setItem(SEAT_STORAGE_KEY, JSON.stringify({ code: room.code, token: room.token }));
}

export function forgetSeat(): void {
  sessionStorage.removeItem(SEAT_STORAGE_KEY);
}

/** The seat from before a page reload, if any. */
export function rememberedSeat(): { code: string; token: string } | null {
  try {
    const seat = JSON.parse(sessionStorage.getItem(SEAT_STORAGE_KEY) ?? 'null') as { code?: unknown; token?: unknown } | null;
    return seat && typeof seat.code === 'string' && typeof seat.token === 'string'
      ? { code: seat.code, token: seat.token }
      : null;
  } catch {
    return null;
  }
}
