/**
 * Browser entry point. Connects to the server and starts the app.
 *
 * URL options for experimenting (see LEARNING.md):
 *   ?lag=100      add 100 ms artificial delay in each direction (ping +200 ms)
 *   ?jitter=30    add 0-30 ms random extra delay per message
 *   ?predict=0    turn client-side prediction off, to feel what it is good for
 */
import { GameClient } from '../netcode/gameClient';
import { openTransport, type ConnectionOptions } from './app/connection';
import { startGameApp } from './app/gameApp';
import { TEXT } from './ui/hudTexts';

const params = new URLSearchParams(location.search);
const connection: ConnectionOptions = {
  lagMs: Number(params.get('lag') ?? 0),
  jitterMs: Number(params.get('jitter') ?? 0),
};
const predict = params.get('predict') !== '0';

const debugInfo = [
  connection.lagMs || connection.jitterMs ? `fake lag ${connection.lagMs}+${connection.jitterMs} ms` : '',
  predict ? '' : 'PREDICTION OFF',
].join(' ');

try {
  const client = new GameClient(await openTransport(connection), { predict });
  startGameApp(client, connection, debugInfo);
  // Debugging aid: type `game.stats` or `game.localPlayer` in the browser console.
  (window as unknown as { game: GameClient }).game = client;
} catch {
  document.getElementById('lobby-status')!.textContent = TEXT.serverUnreachable;
}
