/**
 * Server entry point: `npm start` (or `npm run dev:server`).
 *
 * Environment variables:
 *   PORT        port to listen on (default 3000)
 *   FAST_MATCH  set to 1 for very short rounds (handy for testing)
 *   MAP         force this map id for every room (default: players choose in the menu,
 *               quick match rotates; ids are in src/shared/maps/index.ts)
 */
import { networkInterfaces } from 'node:os';
import { DEFAULT_MATCH_CONFIG, FAST_MATCH_CONFIG } from '../shared/match/matchConfig';
import { startServer } from './startServer';

/** Addresses under which other devices in the same Wi-Fi can reach this computer. */
function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((net) => net && net.family === 'IPv4' && !net.internal)
    .map((net) => net!.address);
}

const port = Number(process.env.PORT ?? 3000);
const matchConfig = process.env.FAST_MATCH === '1' ? FAST_MATCH_CONFIG : DEFAULT_MATCH_CONFIG;

const server = await startServer({ port, matchConfig, mapId: process.env.MAP });
console.log(`[server] listening on http://localhost:${server.port}  (WebSocket: /ws, stats: /stats)`);
for (const address of lanAddresses()) {
  console.log(`[server] same Wi-Fi: http://${address}:${server.port}`);
}

// Print a warning if the simulation cannot keep up or errors occur.
setInterval(() => {
  const stats = server.game.stats();
  if (stats.errors > 0) console.warn(`[server] ${stats.errors} errors, last: ${stats.lastError}`);
  if (stats.tick.p99Ms > 8) console.warn(`[server] slow ticks: p99 ${stats.tick.p99Ms.toFixed(2)} ms`);
}, 10_000).unref();

const shutdown = () => {
  void server.close().then(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
