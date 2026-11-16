/**
 * A tiny reverse proxy for tests. It does what an internet tunnel or a hosting provider
 * does: accept everything (web pages AND WebSockets) on its own port and pass it on to
 * the game server - which then sees a different "Host" than the one the player typed.
 */
import { createServer, request, type IncomingMessage, type Server } from 'node:http';
import { connect, type AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';

export interface RunningProxy {
  port: number;
  /** How many WebSocket connections were passed through. */
  upgrades: () => number;
  close(): Promise<void>;
}

export async function startReverseProxy(targetPort: number): Promise<RunningProxy> {
  let upgrades = 0;
  const sockets = new Set<Duplex>();

  // Normal HTTP requests: repeat the request against the game server and pipe the answer back.
  const server: Server = createServer((req, res) => {
    const forward = request(
      { host: '127.0.0.1', port: targetPort, path: req.url, method: req.method, headers: req.headers },
      (answer) => {
        res.writeHead(answer.statusCode ?? 502, answer.headers);
        answer.pipe(res);
      },
    );
    forward.on('error', () => res.writeHead(502).end());
    req.pipe(forward);
  });

  // WebSocket upgrade: open a raw connection to the game server, replay the request
  // header, then connect both sides byte by byte.
  server.on('upgrade', (req: IncomingMessage, client: Duplex, head: Buffer) => {
    upgrades++;
    const upstream = connect(targetPort, '127.0.0.1', () => {
      const headers = Object.entries(req.headers).map(([key, value]) => `${key}: ${String(value)}`);
      upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n${headers.join('\r\n')}\r\n\r\n`);
      upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    for (const socket of [client, upstream]) {
      sockets.add(socket);
      socket.on('error', () => socket.destroy());
      socket.on('close', () => sockets.delete(socket));
    }
    upstream.on('close', () => client.destroy());
    client.on('close', () => upstream.destroy());
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  return {
    port: (server.address() as AddressInfo).port,
    upgrades: () => upgrades,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}
