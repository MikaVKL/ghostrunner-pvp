/**
 * Bot self-play: measures how strong the difficulty levels are and finds better values.
 *
 *   npm run tune              search the skill values and write BALANCE.md   (~4 minutes)
 *   npm run tune -- --quick   only measure the current values                (~1 minute)
 *
 * Goal: "Mittel" wins about 70 % of its matches against "Leicht", "Schwer" about 90 %
 * against "Mittel" ("Leicht" against itself is 50 % by definition - that row only shows
 * whether one side of the map has an advantage).
 *
 * A level is one number, the skill (see src/solo/difficulty.ts). The script plays whole
 * best-of-5 bot matches on all maps over the simulated network and searches the skill by
 * halving the range again and again (bisection). At the end it prints the values to copy
 * into `SKILL` in src/solo/difficulty.ts. Everything is seeded, so the same code gives the
 * same numbers.
 */
import { writeFileSync } from 'node:fs';
import type { BotPersonality } from '../src/bots/brain';
import { runSimulatedMatch } from '../src/bots/simulation';
import { MAPS } from '../src/shared/maps';
import { FAST_MATCH_CONFIG, type MatchConfig } from '../src/shared/match/matchConfig';
import { personalityForSkill, SKILL, type Difficulty } from '../src/solo/difficulty';

/** Real rules (first to 3 round wins), but short pauses so a match simulates quickly. */
const RULES: MatchConfig = { ...FAST_MATCH_CONFIG, roundsToWin: 3, maxRounds: 9 };
const MAP_IDS = Object.keys(MAPS);
const TARGET = { mittelVsLeicht: 0.7, schwerVsMittel: 0.9 };

interface Tally {
  matches: number;
  /** Wins of the stronger side; a draw counts as half a win. */
  wins: number;
  parries: number;
  enemySwings: number;
}

interface Duel {
  total: Tally;
  byMap: Record<string, Tally>;
}

const emptyTally = (): Tally => ({ matches: 0, wins: 0, parries: 0, enemySwings: 0 });
const winRate = (t: Tally) => (t.matches === 0 ? 0 : t.wins / t.matches);
const parryRate = (t: Tally) => (t.enemySwings === 0 ? 0 : t.parries / t.enemySwings);
const percent = (value: number) => `${Math.round(value * 100)} %`;

/**
 * Let personality `a` play `matches` matches against `b`: all maps in turn, and the two
 * swap sides every match (so a better spawn side cannot fake a result).
 */
function duel(a: BotPersonality, b: BotPersonality, matches: number, firstSeed: number): Duel {
  const result: Duel = { total: emptyTally(), byMap: {} };
  for (let i = 0; i < matches; i++) {
    const mapId = MAP_IDS[i % MAP_IDS.length];
    const aIsHost = Math.floor(i / MAP_IDS.length) % 2 === 0;
    const report = runSimulatedMatch({
      seed: firstSeed + i,
      mapId,
      matchConfig: RULES,
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

/** Find the skill whose win rate against `opponentSkill` is closest to `target`. */
function searchSkill(label: string, opponentSkill: number, target: number, low: number, matches: number): number {
  let lo = low;
  let hi = 1;
  let best = { skill: hi, error: Infinity };
  for (let step = 0; step < 6; step++) {
    const skill = (lo + hi) / 2;
    // The same seeds for every step: the candidates are compared on the same matches,
    // which makes the search much less noisy.
    const rate = winRate(duel(personalityForSkill(skill), personalityForSkill(opponentSkill), matches, 5000).total);
    console.log(`  ${label}: skill ${skill.toFixed(3)} -> ${percent(rate)} (target ${percent(target)})`);
    if (Math.abs(rate - target) < best.error) best = { skill, error: Math.abs(rate - target) };
    if (rate < target) lo = skill;
    else hi = skill;
  }
  return Math.round(best.skill * 100) / 100;
}

function row(name: string, d: Duel): string {
  const maps = MAP_IDS.map((id) => percent(winRate(d.byMap[id] ?? emptyTally()))).join(' | ');
  return `| ${name} | **${percent(winRate(d.total))}** | ${maps} | ${percent(parryRate(d.total))} | ${d.total.matches} |`;
}

const quick = process.argv.includes('--quick');
const skill: Record<Difficulty, number> = { ...SKILL };
if (!quick) {
  console.log('Searching skill values (bisection, 128 matches per step) ...');
  skill.mittel = searchSkill('Mittel vs Leicht', skill.leicht, TARGET.mittelVsLeicht, skill.leicht, 128);
  skill.schwer = searchSkill('Schwer vs Mittel', skill.mittel, TARGET.schwerVsMittel, skill.mittel, 128);
}

console.log('Measuring the final values (160 matches per pairing) ...');
const p = (level: Difficulty) => personalityForSkill(skill[level]);
const results = {
  mirror: duel(p('leicht'), p('leicht'), 160, 100),
  mittelVsLeicht: duel(p('mittel'), p('leicht'), 160, 200),
  schwerVsMittel: duel(p('schwer'), p('mittel'), 160, 400),
  schwerVsLeicht: duel(p('schwer'), p('leicht'), 160, 600),
};

const mapHeader = MAP_IDS.map((id) => MAPS[id].name).join(' | ');
const lines = [
  '# BALANCE.md – Wie stark sind die Schwierigkeitsstufen?',
  '',
  'Diese Datei wird von `npm run tune` erzeugt (Bots spielen gegeneinander, ganze',
  'Best-of-5-Matches über das simulierte Netz mit 80 ms Ping). **Nicht von Hand ändern** –',
  'nach Änderungen an der Bot-KI oder den Kampfregeln `npm run tune` neu ausführen.',
  '',
  `Stand: ${quick ? 'nur gemessen (`--quick`)' : 'gesucht und gemessen'}. Ziel: Mittel gewinnt ~70 % gegen Leicht, Schwer ~90 % gegen Mittel.`,
  '',
  '## Gewinnquote der stärkeren Stufe',
  '',
  `| Paarung | gesamt | ${mapHeader} | Parry-Quote | Matches |`,
  `|---|---|${MAP_IDS.map(() => '---').join('|')}|---|---|`,
  row('Leicht gegen Leicht (Kontrolle, soll ~50 % sein)', results.mirror),
  row('Mittel gegen Leicht (Ziel 70 %)', results.mittelVsLeicht),
  row('Schwer gegen Mittel (Ziel 90 %)', results.schwerVsMittel),
  row('Schwer gegen Leicht', results.schwerVsLeicht),
  '',
  '- **Gewinnquote:** Siege der zuerst genannten Stufe; ein Unentschieden zählt als halber Sieg.',
  '- **Parry-Quote:** erfolgreiche Parrys der zuerst genannten Stufe, geteilt durch alle',
  '  Schwünge des Gegners (auch die, die ohnehin danebengingen – die Zahl wirkt deshalb klein).',
  '- Die Seiten werden nach jedem Durchgang durch alle Maps getauscht.',
  '- Bei 160 Matches schwankt eine Quote zufällig um etwa ±4 Prozentpunkte, pro Map (40',
  '  Matches) um etwa ±8.',
  '',
  '## Können-Werte (`SKILL` in `src/solo/difficulty.ts`)',
  '',
  '| Stufe | Können (0 = schwächster, 1 = stärkster Bot) |',
  '|---|---|',
  ...(['leicht', 'mittel', 'schwer'] as Difficulty[]).map((level) => `| ${level} | ${skill[level]} |`),
  '',
  'Aus dem Können werden alle Bot-Parameter berechnet (`personalityForSkill`): Drehtempo,',
  'Angriffs-, Dash-Angriffs- und Parry-Wahrscheinlichkeit, Lust auf Parkour.',
  '',
  '## Grenzen dieser Messung',
  '',
  '- Bots spielen gegen Bots. Wie sich die Stufen für einen Menschen anfühlen, misst das nicht.',
  '- Gemessen wird mit kurzen Pausen zwischen den Runden, sonst mit den echten Regeln.',
  '',
];
writeFileSync('BALANCE.md', lines.join('\n'));
console.log('\nWrote BALANCE.md.');
console.log(`Copy into SKILL in src/solo/difficulty.ts:  leicht: ${skill.leicht}, mittel: ${skill.mittel}, schwer: ${skill.schwer}`);
for (const [name, d] of Object.entries(results)) console.log(`  ${name}: ${percent(winRate(d.total))}`);
