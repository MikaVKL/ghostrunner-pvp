/**
 * Writes the result of `npm run tune` (scripts/tune.ts) as BALANCE.md: one table of win
 * rates per game mode, plus the skill values.
 */
import { MAPS } from '../src/shared/maps';
import { getMode, type ModeId } from '../src/shared/match/gameModes';
import type { Difficulty } from '../src/solo/difficulty';
import { emptyTally, MAP_IDS, parryRate, percent, winRate, type Series } from './tuneMatches';

export interface ModeResult {
  modeId: ModeId;
  skill: Record<Difficulty, number>;
  series: { mirror: Series; mittelVsLeicht: Series; schwerVsMittel: Series; schwerVsLeicht: Series };
}

const LEVELS: Difficulty[] = ['leicht', 'mittel', 'schwer'];

function row(name: string, s: Series): string {
  const maps = MAP_IDS.map((id) => percent(winRate(s.byMap[id] ?? emptyTally()))).join(' | ');
  return `| ${name} | **${percent(winRate(s.total))}** | ${maps} | ${percent(parryRate(s.total))} | ${s.total.matches} |`;
}

function modeSection(result: ModeResult): string[] {
  const mode = getMode(result.modeId);
  const mapHeader = MAP_IDS.map((id) => MAPS[id].name).join(' | ');
  return [
    `## Modus ${mode.name}`,
    '',
    `Regeln: ${mode.lives} Leben, erster mit ${mode.roundsToWin} Rundensiegen gewinnt.`,
    '',
    `| Paarung | gesamt | ${mapHeader} | Parry-Quote | Matches |`,
    `|---|---|${MAP_IDS.map(() => '---').join('|')}|---|---|`,
    row('Leicht gegen Leicht (Kontrolle, soll ~50 % sein)', result.series.mirror),
    row('Mittel gegen Leicht (Ziel 70 %)', result.series.mittelVsLeicht),
    row('Schwer gegen Mittel (Ziel 90 %)', result.series.schwerVsMittel),
    row('Schwer gegen Leicht', result.series.schwerVsLeicht),
    '',
  ];
}

export function balanceMarkdown(results: ModeResult[], quick: boolean): string {
  const modeNames = results.map((r) => getMode(r.modeId).name);
  const lines = [
    '# BALANCE.md – Wie stark sind die Schwierigkeitsstufen?',
    '',
    'Diese Datei wird von `npm run tune` erzeugt (Bots spielen gegeneinander, ganze Matches',
    'mit den Rundenregeln des jeweiligen Modus über das simulierte Netz mit 80 ms Ping).',
    '**Nicht von Hand ändern** – nach Änderungen an der Bot-KI, den Kampfregeln oder einem',
    'Modus `npm run tune` neu ausführen.',
    '',
    `Stand: ${quick ? 'nur gemessen (`--quick`)' : 'gesucht und gemessen'}. Ziel in jedem Modus: Mittel gewinnt ~70 % gegen Leicht, Schwer ~90 % gegen Mittel.`,
    '',
    ...results.flatMap(modeSection),
    '- **Gewinnquote:** Siege der zuerst genannten Stufe; ein Unentschieden zählt als halber Sieg.',
    '- **Parry-Quote:** erfolgreiche Parrys der zuerst genannten Stufe, geteilt durch alle',
    '  Schwünge des Gegners (auch die, die ohnehin danebengingen – die Zahl wirkt deshalb klein).',
    '- Die Seiten werden nach jedem Durchgang durch alle Maps getauscht.',
    '- Bei 160 Matches schwankt eine Quote zufällig um etwa ±4 Prozentpunkte, pro Map (40',
    '  Matches) um etwa ±8.',
    '',
    '## Können-Werte (`SKILL` in `src/solo/difficulty.ts`)',
    '',
    `| Stufe | ${modeNames.join(' | ')} |`,
    `|---|${modeNames.map(() => '---').join('|')}|`,
    ...LEVELS.map((level) => `| ${level} | ${results.map((r) => r.skill[level]).join(' | ')} |`),
    '',
    'Können: 0 = schwächster, 1 = stärkster Bot. Daraus werden alle Bot-Parameter berechnet',
    '(`personalityForSkill`): Drehtempo, Reaktionszeit, Angriffs-, Dash-Angriffs- und',
    'Parry-Wahrscheinlichkeit, Lust auf Parkour. Wie der Bot einen Modus spielt (z. B. in der',
    'Arena öfter parieren), steht getrennt davon in `src/bots/modeTactics.ts`.',
    '',
    '## Grenzen dieser Messung',
    '',
    '- Bots spielen gegen Bots. Wie sich die Stufen für einen Menschen anfühlen, misst das nicht.',
    '- Gemessen wird mit kurzen Pausen zwischen den Runden, sonst mit den echten Regeln.',
    '',
  ];
  return lines.join('\n');
}
