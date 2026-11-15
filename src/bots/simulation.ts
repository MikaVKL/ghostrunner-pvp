/**
 * Runs a complete bot-vs-bot match inside this process on virtual time (no sockets, no
 * waiting). The real server code and the real client netcode are used; only the network
 * and the clock are fake. This is what the automated tests and `npm run bots:sim` use.
 */
import { TICK_MS } from '../shared/config';
import { FAST_MATCH_CONFIG, type MatchConfig } from '../shared/match/matchConfig';
import { GameServer } from '../server/gameServer';
import { Bot } from './bot';
import { MemoryNetwork } from './memoryNetwork';
import { botReport, type MatchReport } from './report';

export interface SimOptions {
  label?: string;
  /** Same seed => exactly the same match. */
  seed: number;
  /** One-way network delay in ms. */
  latencyMs?: number;
  /** Random extra delay per message in ms. */
  jitterMs?: number;
  /** Clock error of the bots, e.g. 0.002 = one bot ticks 0.2 % too fast, the other too slow. */
  clockDrift?: number;
  /** Give up after this much simulated time. */
  maxSeconds?: number;
  matchConfig?: MatchConfig;
  /** Use quick match instead of create/join by room code. */
  useQuickMatch?: boolean;
  /** Reuse an existing server (to collect statistics over several matches). */
  server?: GameServer;
}

/** Something that must be called at a fixed interval of virtual time. */
interface Actor {
  nextAt: number;
  period: number;
  run: () => void;
}

export function runSimulatedMatch(options: SimOptions): MatchReport {
  const net = new MemoryNetwork({
    latencyMs: options.latencyMs ?? 0,
    jitterMs: options.jitterMs ?? 0,
    seed: options.seed,
  });
  const server = options.server ?? new GameServer({ matchConfig: options.matchConfig ?? FAST_MATCH_CONFIG });
  const now = () => net.nowMs;

  const bots = ['botA', 'botB'].map((name, i) => {
    const link = net.createLink();
    server.attach(link.server);
    return new Bot(link.client, { name, seed: options.seed * 2 + i, now });
  });
  const [host, guest] = bots;

  if (options.useQuickMatch) {
    host.client.quickMatch(host.name);
    guest.client.quickMatch(guest.name);
  } else {
    host.client.onRoomJoined = (room) => guest.client.joinRoom(room.code, guest.name);
    host.client.createRoom(host.name);
  }

  // Server and bots tick at slightly different moments and speeds, like real computers.
  const drift = options.clockDrift ?? 0;
  const actors: Actor[] = [
    { nextAt: 0, period: TICK_MS, run: () => server.tick() },
    { nextAt: TICK_MS * 0.37, period: TICK_MS * (1 + drift), run: () => host.tick() },
    { nextAt: TICK_MS * 0.71, period: TICK_MS * (1 - drift), run: () => guest.tick() },
  ];

  const maxMs = (options.maxSeconds ?? 600) * 1000;
  const finished = () => bots.every((bot) => bot.matchFinished);
  while (net.nowMs < maxMs && !finished()) {
    const actor = actors.reduce((first, a) => (a.nextAt < first.nextAt ? a : first));
    net.advanceTo(actor.nextAt);
    actor.run();
    actor.nextAt += actor.period;
  }

  const durationSec = net.nowMs / 1000;
  for (const bot of bots) bot.client.close();
  net.advanceTo(net.nowMs + 1); // deliver the close events so the server frees the room

  return {
    label: options.label ?? `seed ${options.seed}`,
    finished: finished(),
    winner: host.matchWinner,
    rounds: host.roundsPlayed,
    durationSec,
    bots: bots.map(botReport),
  };
}
