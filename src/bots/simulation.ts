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
  /** Map for the room (not with quick match). Default: the server's default map. */
  mapId?: string;
  /** Reuse an existing server (to collect statistics over several matches). */
  server?: GameServer;
  /**
   * Simulate a connection loss: the link of bot `bot` (0 or 1) breaks at `atMs` and the
   * bot reconnects `forMs` later with a new link (see GameClient.reconnect).
   */
  disconnect?: { bot: number; atMs: number; forMs: number };
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

  const links = [net.createLink(), net.createLink()];
  const bots = ['botA', 'botB'].map((name, i) => {
    server.attach(links[i].server);
    return new Bot(links[i].client, { name, seed: options.seed * 2 + i, now });
  });
  const [host, guest] = bots;

  if (options.useQuickMatch) {
    host.client.quickMatch(host.name);
    guest.client.quickMatch(guest.name);
  } else {
    // The guest follows the host into its room (only once - a rejoin also reports "joined").
    host.client.onRoomJoined = (room) => {
      if (!guest.client.room) guest.client.joinRoom(room.code, guest.name);
    };
    host.client.createRoom(host.name, options.mapId);
  }

  // Server and bots tick at slightly different moments and speeds, like real computers.
  const drift = options.clockDrift ?? 0;
  const actors: Actor[] = [
    { nextAt: 0, period: TICK_MS, run: () => server.tick() },
    { nextAt: TICK_MS * 0.37, period: TICK_MS * (1 + drift), run: () => host.tick() },
    { nextAt: TICK_MS * 0.71, period: TICK_MS * (1 - drift), run: () => guest.tick() },
  ];

  const outage = options.disconnect;
  if (outage) {
    const reconnect = () => {
      const link = net.createLink();
      server.attach(link.server);
      bots[outage.bot].client.reconnect(link.client);
    };
    // "Never" as period: each of the two actors runs exactly once.
    actors.push({ nextAt: outage.atMs, period: Infinity, run: () => net.breakLink(links[outage.bot]) });
    actors.push({ nextAt: outage.atMs + outage.forMs, period: Infinity, run: reconnect });
  }

  const maxMs = (options.maxSeconds ?? 600) * 1000;
  const finished = () => bots.every((bot) => bot.matchFinished);
  while (net.nowMs < maxMs && !finished()) {
    const actor = actors.reduce((first, a) => (a.nextAt < first.nextAt ? a : first));
    net.advanceTo(actor.nextAt);
    actor.run();
    actor.nextAt += actor.period;
  }

  const durationSec = net.nowMs / 1000;
  const report = bots.map(botReport);
  const mapId = host.client.room?.mapId ?? '?';
  // Leave for good (otherwise the server keeps the seats reserved), let the goodbyes
  // arrive, then close the connections.
  for (const bot of bots) bot.client.leaveRoom();
  net.advanceTo(net.nowMs + (options.latencyMs ?? 0) + (options.jitterMs ?? 0) + 1);
  for (const bot of bots) bot.client.close();
  net.advanceTo(net.nowMs + 1);

  return {
    label: options.label ?? `seed ${options.seed}`,
    mapId,
    finished: finished(),
    winner: host.matchWinner,
    rounds: host.roundsPlayed,
    durationSec,
    bots: report,
  };
}
