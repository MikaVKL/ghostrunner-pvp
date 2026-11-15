/**
 * Command line entry for the test bots.
 *
 *   npm run bots:sim                 fast in-memory simulation (seconds)
 *   npm run bots                     real server + real WebSockets (takes a minute or two)
 *
 * Options (append after `--`, e.g. `npm run bots:sim -- --matches 50 --lag 120`):
 *   --matches N    number of matches                       (sim: 20, live: 3)
 *   --lag MS       one-way network delay                    (default: sim 60, live 0)
 *   --jitter MS    random extra delay per message           (default: sim 30, live 0)
 *   --drift X      clock error of the bots, sim only        (default 0.002)
 *   --seed N       first random seed                        (default 1)
 *   --map ID       play every match on this map             (default: take turns through all maps)
 *   --url URL      live only: use an already running server (e.g. ws://localhost:3000/ws)
 *   --full         live only: normal match length instead of short test rounds
 *   --timeout SEC  live only: give up after this long       (default 300)
 *
 * The process exits with code 1 if any desync or error was found.
 */
import { GameServer, type ServerStats } from '../server/gameServer';
import { startServer } from '../server/startServer';
import { MAPS } from '../shared/maps';
import { DEFAULT_MATCH_CONFIG, FAST_MATCH_CONFIG } from '../shared/match/matchConfig';
import { runLiveMatch } from './liveRunner';
import { findProblems, printReport, type RunReport } from './report';
import { runSimulatedMatch } from './simulation';

type Args = Record<string, string>;

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
    args[key] = value;
  }
  return args;
}

const num = (args: Args, key: string, fallback: number) =>
  args[key] !== undefined ? Number(args[key]) : fallback;

/** Map for match number `i`: the one from --map, otherwise all maps take turns. */
const ALL_MAP_IDS = Object.keys(MAPS);
const mapFor = (args: Args, i: number) => args.map ?? ALL_MAP_IDS[i % ALL_MAP_IDS.length];

function runSim(args: Args): RunReport {
  const matches = num(args, 'matches', 20);
  const seed = num(args, 'seed', 1);
  const server = new GameServer({ matchConfig: FAST_MATCH_CONFIG });
  const reports = [];
  for (let i = 0; i < matches; i++) {
    reports.push(
      runSimulatedMatch({
        label: `sim#${seed + i}`,
        seed: seed + i,
        latencyMs: num(args, 'lag', 60),
        jitterMs: num(args, 'jitter', 30),
        clockDrift: num(args, 'drift', 0.002),
        useQuickMatch: i % 5 === 4,
        mapId: mapFor(args, i),
        server,
      }),
    );
  }
  return { matches: reports, server: server.stats() };
}

async function runLive(args: Args): Promise<RunReport> {
  const matches = num(args, 'matches', 3);
  const seed = num(args, 'seed', 1);
  const matchConfig = args.full ? DEFAULT_MATCH_CONFIG : FAST_MATCH_CONFIG;
  const ownServer = args.url ? null : await startServer({ port: 0, matchConfig });
  const url = args.url ?? `ws://localhost:${ownServer!.port}/ws`;
  console.log(`Running ${matches} live match(es) against ${url} ...`);

  const reports = await Promise.all(
    Array.from({ length: matches }, (_, i) =>
      runLiveMatch({
        url,
        label: `live#${seed + i}`,
        seed: seed + i,
        lagMs: num(args, 'lag', 0),
        jitterMs: num(args, 'jitter', 0),
        timeoutSec: num(args, 'timeout', 300),
        useQuickMatch: i === matches - 1 && matches > 1,
        mapId: mapFor(args, i),
      }),
    ),
  );

  let server: ServerStats | null = null;
  if (ownServer) {
    server = ownServer.game.stats();
    await ownServer.close();
  } else {
    const statsUrl = url.replace(/^ws/, 'http').replace(/\/ws$/, '/stats');
    server = await fetch(statsUrl).then((r) => r.json() as Promise<ServerStats>).catch(() => null);
  }
  return { matches: reports, server };
}

const mode = process.argv[2];
const args = parseArgs(process.argv.slice(3));
if (mode !== 'sim' && mode !== 'live') {
  console.error('Usage: tsx src/bots/cli.ts <sim|live> [options]   (see the top of src/bots/cli.ts)');
  process.exit(2);
}
const report = mode === 'sim' ? runSim(args) : await runLive(args);
printReport(report);
process.exit(findProblems(report).length === 0 ? 0 : 1);
