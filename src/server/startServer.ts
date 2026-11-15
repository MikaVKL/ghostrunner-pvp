/**
 * Starts the real server: HTTP (static files, /health, /stats) + WebSocket (/ws)
 * + the 60 Hz tick loop. Used by main.ts, the bot runner and integration tests.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer } from 'ws';
import { MAX_CLIENT_MESSAGE_LENGTH } from '../shared/protocol/codec';
import { TickLoop } from '../shared/util/tickLoop';
import { GameServer, type GameServerOptions } from './gameServer';
import { serveStatic } from './http/staticFiles';
import { wrapServerSocket } from './net/wsTransport';

export interface StartServerOptions extends GameServerOptions {
  /** TCP port. Use 0 to let the system pick a free one (tests). */
  port?: number;
  /** Folder with the built client. */
  staticDir?: string;
}

export interface RunningServer {
  port: number;
  game: GameServer;
  close(): Promise<void>;
}

function sendJson(res: ServerResponse, body: unknown): void {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

export async function startServer(options: StartServerOptions = {}): Promise<RunningServer> {
  const game = new GameServer(options);
  const staticDir = options.staticDir ?? 'dist/client';

  const http = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? '/';
    if (url === '/health') return sendJson(res, { ok: true });
    if (url === '/stats') return sendJson(res, game.stats());
    if (serveStatic(staticDir, url, res)) return;
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found. Run "npm run build" to build the client, or use "npm run dev".');
  });

  const wss = new WebSocketServer({
    server: http,
    path: '/ws',
    maxPayload: MAX_CLIENT_MESSAGE_LENGTH * 4,
  });
  wss.on('connection', (socket) => game.attach(wrapServerSocket(socket)));

  const loop = new TickLoop(() => game.tick());

  await new Promise<void>((resolve, reject) => {
    http.once('error', reject);
    http.listen(options.port ?? 3000, () => resolve());
  });
  loop.start();

  return {
    port: (http.address() as AddressInfo).port,
    game,
    close: () =>
      new Promise<void>((resolve) => {
        loop.stop();
        for (const socket of wss.clients) socket.terminate();
        wss.close(() => http.close(() => resolve()));
      }),
  };
}
