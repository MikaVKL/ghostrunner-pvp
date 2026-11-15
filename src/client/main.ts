/**
 * Browser entry point. Connects to the server and starts the app.
 *
 * URL options for experimenting (see LEARNING.md):
 *   ?lag=100      add 100 ms artificial delay in each direction (ping +200 ms)
 *   ?jitter=30    add 0-30 ms random extra delay per message
 *   ?predict=0    turn client-side prediction off, to feel what it is good for
 */
import { GameClient } from '../netcode/gameClient';
import { withLag } from '../netcode/lagTransport';
import { connectWebSocket } from '../netcode/webSocketTransport';
import { startGameApp } from './app/gameApp';

const params = new URLSearchParams(location.search);
const lagMs = Number(params.get('lag') ?? 0);
const jitterMs = Number(params.get('jitter') ?? 0);
const predict = params.get('predict') !== '0';

// Same host that served the page. In dev, Vite forwards /ws to the game server.
const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
const url = `${protocol}://${location.host}/ws`;

const debugInfo = [
  lagMs || jitterMs ? `fake lag ${lagMs}+${jitterMs} ms` : '',
  predict ? '' : 'PREDICTION OFF',
].join(' ');

try {
  const socket = await connectWebSocket(url);
  const client = new GameClient(withLag(socket, lagMs, jitterMs), { predict });
  startGameApp(client, debugInfo);
  // Debugging aid: type `game.stats` or `game.localPlayer` in the browser console.
  (window as unknown as { game: GameClient }).game = client;
} catch {
  document.getElementById('lobby-status')!.textContent =
    'Cannot reach the game server. Is it running? (npm run dev)';
}
