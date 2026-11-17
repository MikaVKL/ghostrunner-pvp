/**
 * Bot-vs-bot match series for `npm run tune` (scripts/tune.ts): play many seeded matches
 * between two personalities and count wins and parries, in total and per map.
 */
import type { BotPersonality } from '../src/bots/brain';
import { runSimulatedMatch } from '../src/bots/simulation';
import { MAPS } from '../src/shared/maps';
import { getMode, type ModeId } from '../src/shared/match/gameModes';
import { FAST_MATCH_CONFIG, type MatchConfig } from '../src/shared/match/matchConfig';

export const MAP_IDS = Object.keys(MAPS);

export interface Tally {
  matches: number;
  /** Wins of the first-named side; a draw counts as half a win. */
  wins: number;
  parries: number;
  enemySwings: number;
}

export interface Series {
  total: Tally;
  byMap: Record<string, Tally>;
}

export const emptyTally = (): Tally => ({ matches: 0, wins: 0, parries: 0, enemySwings: 0 });
export const winRate = (t: Tally) => (t.matches === 0 ? 0 : t.wins / t.matches);
export const parryRate = (t: Tally) => (t.enemySwings === 0 ? 0 : t.parries / t.enemySwings);
export const percent = (value: number) => `${Math.round(value * 100)} %`;

/** The real round rules of the mode, but short pauses so a match simulates quickly. */
export function rulesFor(modeId: ModeId): MatchConfig {
  const mode = getMode(modeId);
  return { ...FAST_MATCH_CONFIG, roundsToWin: mode.roundsToWin, maxRounds: mode.maxRounds };
}

/**
 * Let personality `a` play `matches` matches against `b` in a mode: all maps in turn, and
 * the two swap sides after every round of maps (so a better spawn side cannot fake a result).
 */
export function playSeries(
  modeId: ModeId,
  a: BotPersonality,
  b: BotPersonality,
  matches: number,
  firstSeed: number,
): Series {
  const result: Series = { total: emptyTally(), byMap: {} };
  for (let i = 0; i < matches; i++) {
    const mapId = MAP_IDS[i % MAP_IDS.length];
    const aIsHost = Math.floor(i / MAP_IDS.length) % 2 === 0;
    const report = runSimulatedMatch({
      seed: firstSeed + i,
      mapId,
      modeId,
      matchConfig: rulesFor(modeId),
      latencyMs: 40,
      jitterMs: 10,
      personalities: aIsHost ? [a, b] : [b, a],
    });
    const mine = report.bots[aIsHost ? 0 : 1];
    const theirs = report.bots[aIsHost ? 1 : 0];
    const won = report.winner === null || report.winner < 0 ? 0.5 : (report.winner === 0) === aIsHost ? 1 : 0;
    for (const tally of [result.total, (result.byMap[mapId] ??= emptyTally())]) {
      tally.matches++;
      tally.wins += won;
      tally.parries += mine.usage.parries;
      tally.enemySwings += theirs.usage.swings;
    }
  }
  return result;
}
