/**
 * Bot self-play: measures how strong the difficulty levels are and finds better values,
 * separately for every game mode (the same bot is stronger or weaker under other rules).
 *
 *   npm run tune                 search the skill values of all modes, write BALANCE.md  (~10 min)
 *   npm run tune -- --quick      only measure the current values, write BALANCE.md       (~3 min)
 *   npm run tune -- --mode arena only this mode; prints the result, does NOT write BALANCE.md
 *
 * Goal: "Mittel" wins about 70 % of its matches against "Leicht", "Schwer" about 90 %
 * against "Mittel" ("Leicht" against itself is 50 % by definition - that row only shows
 * whether one side of the map has an advantage).
 *
 * A level is one number, the skill (see src/solo/difficulty.ts). The script plays whole
 * bot matches with the mode's round rules on all maps over the simulated network and
 * searches the skill by halving the range again and again (bisection). At the end it
 * prints the values to copy into `SKILL` in src/solo/difficulty.ts. Everything is seeded,
 * so the same code gives the same numbers.
 */
import { writeFileSync } from 'node:fs';
import { getMode, isModeId, MODE_IDS, type ModeId } from '../src/shared/match/gameModes';
import { personalityForSkill, SKILL, type Difficulty } from '../src/solo/difficulty';
import { balanceMarkdown, type ModeResult } from './tuneReport';
import { percent, playSeries, winRate } from './tuneMatches';

const TARGET = { mittelVsLeicht: 0.7, schwerVsMittel: 0.9 };
const SEARCH_MATCHES = 128;
const MEASURE_MATCHES = 160;

/** Find the skill whose win rate against `opponentSkill` is closest to `target`. */
function searchSkill(modeId: ModeId, label: string, opponentSkill: number, target: number, low: number): number {
  let lo = low;
  let hi = 1;
  let best = { skill: hi, error: Infinity };
  for (let step = 0; step < 6; step++) {
    const skill = (lo + hi) / 2;
    // The same seeds for every step: the candidates are compared on the same matches,
    // which makes the search much less noisy.
    const series = playSeries(modeId, personalityForSkill(skill), personalityForSkill(opponentSkill), SEARCH_MATCHES, 5000);
    const rate = winRate(series.total);
    console.log(`  ${label}: skill ${skill.toFixed(3)} -> ${percent(rate)} (target ${percent(target)})`);
    if (Math.abs(rate - target) < best.error) best = { skill, error: Math.abs(rate - target) };
    if (rate < target) lo = skill;
    else hi = skill;
  }
  return Math.round(best.skill * 100) / 100;
}

function tuneMode(modeId: ModeId, quick: boolean): ModeResult {
  console.log(`\n=== Mode ${getMode(modeId).name} ===`);
  const skill: Record<Difficulty, number> = { ...SKILL[modeId] };
  if (!quick) {
    console.log(`Searching skill values (bisection, ${SEARCH_MATCHES} matches per step) ...`);
    skill.mittel = searchSkill(modeId, 'Mittel vs Leicht', skill.leicht, TARGET.mittelVsLeicht, skill.leicht);
    skill.schwer = searchSkill(modeId, 'Schwer vs Mittel', skill.mittel, TARGET.schwerVsMittel, skill.mittel);
  }
  console.log(`Measuring the final values (${MEASURE_MATCHES} matches per pairing) ...`);
  const p = (level: Difficulty) => personalityForSkill(skill[level]);
  const series = {
    mirror: playSeries(modeId, p('leicht'), p('leicht'), MEASURE_MATCHES, 100),
    mittelVsLeicht: playSeries(modeId, p('mittel'), p('leicht'), MEASURE_MATCHES, 200),
    schwerVsMittel: playSeries(modeId, p('schwer'), p('mittel'), MEASURE_MATCHES, 400),
    schwerVsLeicht: playSeries(modeId, p('schwer'), p('leicht'), MEASURE_MATCHES, 600),
  };
  for (const [name, s] of Object.entries(series)) console.log(`  ${name}: ${percent(winRate(s.total))}`);
  return { modeId, skill, series };
}

const quick = process.argv.includes('--quick');
const modeArg = process.argv[process.argv.indexOf('--mode') + 1];
const only = process.argv.includes('--mode') ? modeArg : undefined;
if (only !== undefined && !isModeId(only)) throw new Error(`Unknown mode "${only}". Known: ${MODE_IDS.join(', ')}`);

const results = (only ? [only] : MODE_IDS).map((modeId) => tuneMode(modeId, quick));
if (!only) {
  writeFileSync('BALANCE.md', balanceMarkdown(results, quick));
  console.log('\nWrote BALANCE.md.');
}
console.log('\nCopy into SKILL in src/solo/difficulty.ts:');
for (const r of results) console.log(`  ${r.modeId}: { leicht: ${r.skill.leicht}, mittel: ${r.skill.mittel}, schwer: ${r.skill.schwer} },`);
