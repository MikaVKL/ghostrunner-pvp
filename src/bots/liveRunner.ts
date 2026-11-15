/**
 * Runs a bot-vs-bot match against a REAL running server over real WebSockets in real
 * time. Slower than the simulation, but it tests the whole stack exactly as players use it.
 */
import { connectWebSocket } from '../netcode/webSocketTransport';
import { withLag } from '../netcode/lagTransport';
import { TickLoop } from '../shared/util/tickLoop';
import { Bot } from './bot';
import { botReport, type MatchReport } from './report';

export interface LiveOptions {
  /** WebSocket address of the server, e.g. ws://localhost:3000/ws */
  url: string;
  label: string;
  seed: number;
  /** Artificial one-way delay in ms added on the bot side. */
  lagMs?: number;
  jitterMs?: number;
  /** Give up after this many real seconds. */
  timeoutSec: number;
  useQuickMatch?: boolean;
}

async function connectBot(options: LiveOptions, name: string, seed: number): Promise<Bot> {
  const socket = await connectWebSocket(options.url);
  return new Bot(withLag(socket, options.lagMs ?? 0, options.jitterMs ?? 0), { name, seed });
}

export async function runLiveMatch(options: LiveOptions): Promise<MatchReport> {
  const host = await connectBot(options, 'botA', options.seed * 2);
  const guest = await connectBot(options, 'botB', options.seed * 2 + 1);
  const bots = [host, guest];

  if (options.useQuickMatch) {
    host.client.quickMatch(host.name);
    guest.client.quickMatch(guest.name);
  } else {
    host.client.onRoomJoined = (room) => guest.client.joinRoom(room.code, guest.name);
    host.client.createRoom(host.name);
  }

  const loops = bots.map((bot) => new TickLoop(() => bot.tick()));
  for (const loop of loops) loop.start();

  const startedAt = performance.now();
  const finished = () => bots.every((bot) => bot.matchFinished);
  await new Promise<void>((resolve) => {
    const timer = setInterval(() => {
      const timedOut = performance.now() - startedAt > options.timeoutSec * 1000;
      const disconnected = bots.some((bot) => !bot.client.connected);
      if (finished() || timedOut || disconnected) {
        clearInterval(timer);
        resolve();
      }
    }, 50);
  });

  for (const loop of loops) loop.stop();
  for (const bot of bots) {
    if (!bot.client.connected) bot.errors.push('connection closed unexpectedly');
    bot.client.close();
  }

  return {
    label: options.label,
    finished: finished(),
    winner: host.matchWinner,
    rounds: host.roundsPlayed,
    durationSec: (performance.now() - startedAt) / 1000,
    bots: bots.map(botReport),
  };
}
