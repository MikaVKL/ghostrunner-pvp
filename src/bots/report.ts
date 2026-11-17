/**
 * Collecting and printing the results of bot matches.
 */
import type { ServerStats } from '../server/gameServer';
import type { Bot, BotUsage } from './bot';

export interface BotReport {
  name: string;
  snapshots: number;
  inputsSent: number;
  corrections: number;
  maxCorrectionM: number;
  desyncs: number;
  desyncDetails: string[];
  rttMs: number;
  errors: string[];
  usage: BotUsage;
}

export interface MatchReport {
  label: string;
  mapId: string;
  modeId: string;
  /** True if the match reached its end before the time limit. */
  finished: boolean;
  winner: number | null;
  rounds: number;
  /** Simulated or real duration in seconds. */
  durationSec: number;
  bots: BotReport[];
}

export interface RunReport {
  matches: MatchReport[];
  server: ServerStats | null;
}

export function botReport(bot: Bot): BotReport {
  const stats = bot.client.stats;
  return {
    name: bot.name,
    snapshots: stats.snapshots,
    inputsSent: stats.inputsSent,
    corrections: stats.corrections,
    maxCorrectionM: stats.maxCorrection,
    desyncs: stats.desyncs,
    desyncDetails: stats.desyncDetails,
    rttMs: stats.rttMs,
    errors: [...bot.errors, ...stats.serverErrors],
    usage: { ...bot.usage },
  };
}

/** Everything that counts as a failure in a run. Empty list = all good. */
export function findProblems(report: RunReport): string[] {
  const problems: string[] = [];
  for (const match of report.matches) {
    if (!match.finished) problems.push(`${match.label}: match did not finish in time`);
    for (const bot of match.bots) {
      if (bot.desyncs > 0) {
        problems.push(`${match.label}/${bot.name}: ${bot.desyncs} DESYNCS, e.g. ${bot.desyncDetails[0]}`);
      }
      for (const error of bot.errors) problems.push(`${match.label}/${bot.name}: error: ${error}`);
      if (bot.snapshots === 0) problems.push(`${match.label}/${bot.name}: received no snapshots`);
    }
  }
  if (report.server) {
    if (report.server.errors > 0) {
      problems.push(`server: ${report.server.errors} errors, last: ${report.server.lastError}`);
    }
    if (report.server.badMessages > 0) {
      problems.push(`server: ${report.server.badMessages} invalid messages received`);
    }
  }
  return problems;
}

/** Sum of the mechanics counters of all bots in all matches. */
export function totalUsage(matches: MatchReport[]): BotUsage {
  const total: BotUsage = {
    wallRunTicks: 0, wallJumps: 0, doubleJumps: 0, padLaunches: 0, clashes: 0, dodges: 0, punishes: 0, dashes: 0, swings: 0, dashAttacks: 0, parries: 0, kills: 0, wounds: 0, counters: 0,
  };
  for (const bot of matches.flatMap((m) => m.bots)) {
    for (const key of Object.keys(total) as (keyof BotUsage)[]) total[key] += bot.usage[key];
  }
  return total;
}

const pad = (value: string | number, width: number) => String(value).padEnd(width);

export function printReport(report: RunReport): void {
  console.log('\n=== BOT REPORT ===');
  console.log(
    pad('match', 10) + pad('map', 10) + pad('mode', 7) + pad('bot', 6) + pad('result', 9) + pad('rounds', 8) + pad('time(s)', 9) +
      pad('snaps', 8) + pad('corrections', 13) + pad('maxCorr(m)', 12) + pad('desyncs', 9) + 'rtt(ms)',
  );
  for (const match of report.matches) {
    match.bots.forEach((bot, slot) => {
      const result = !match.finished ? 'TIMEOUT' : match.winner === slot ? 'win' : match.winner === -1 ? 'draw' : 'loss';
      console.log(
        pad(match.label, 10) + pad(match.mapId, 10) + pad(match.modeId, 7) + pad(bot.name, 6) + pad(result, 9) + pad(match.rounds, 8) +
          pad(match.durationSec.toFixed(1), 9) + pad(bot.snapshots, 8) + pad(bot.corrections, 13) +
          pad(bot.maxCorrectionM.toFixed(3), 12) + pad(bot.desyncs, 9) + bot.rttMs.toFixed(0),
      );
    });
  }
  const total = totalUsage(report.matches);
  console.log(
    `\nmechanics used by the bots: wall-run ${total.wallRunTicks} ticks, wall-jumps ${total.wallJumps}, ` +
      `double jumps ${total.doubleJumps}, pad launches ${total.padLaunches}, dashes ${total.dashes}, ` +
      `swings ${total.swings} (dash attacks ${total.dashAttacks}), parries ${total.parries}, ` +
      `dodges ${total.dodges}, punishes ${total.punishes}, clashes ${total.clashes}, kills ${total.kills}, ` +
      `wounds ${total.wounds}, counters ${total.counters}`,
  );
  if (report.server) {
    const t = report.server.tick;
    console.log(
      `\nserver: ${t.ticks} ticks, avg ${t.avgMs.toFixed(3)} ms, p99 ${t.p99Ms.toFixed(3)} ms, ` +
        `max ${t.maxMs.toFixed(3)} ms, overruns ${t.overruns}, errors ${report.server.errors}`,
    );
  }
  const problems = findProblems(report);
  if (problems.length === 0) {
    console.log('\nRESULT: OK - no desyncs, no errors.');
  } else {
    console.log(`\nRESULT: ${problems.length} PROBLEM(S)`);
    for (const problem of problems) console.log(`  - ${problem}`);
  }
}
