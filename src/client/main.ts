/**
 * Browser entry point. Reads the URL options and starts the app. The app itself tries
 * to reach a game server; if there is none (e.g. on GitHub Pages), the solo mode still works.
 *
 * URL options for experimenting (see LEARNING.md):
 *   ?lag=100      add 100 ms artificial delay in each direction (ping +200 ms), online only
 *   ?jitter=30    add 0-30 ms random extra delay per message, online only
 *   ?predict=0    turn client-side prediction off, to feel what it is good for
 */
import { startGameApp } from './app/gameApp';

const params = new URLSearchParams(location.search);
const connection = {
  lagMs: Number(params.get('lag') ?? 0),
  jitterMs: Number(params.get('jitter') ?? 0),
};
const predict = params.get('predict') !== '0';

const debugInfo = [
  connection.lagMs || connection.jitterMs ? `fake lag ${connection.lagMs}+${connection.jitterMs} ms` : '',
  predict ? '' : 'PREDICTION OFF',
].join(' ');

startGameApp({ connection, predict, debugInfo });
