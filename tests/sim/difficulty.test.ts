/**
 * Do the difficulty levels of the solo mode really differ? Bots with the "schwer"
 * parameters play against bots with the "leicht" parameters.
 */
import { describe, expect, it } from 'vitest';
import { findProblems } from '../../src/bots/report';
import { runSimulatedMatch } from '../../src/bots/simulation';
import { MODE_IDS } from '../../src/shared/match/gameModes';
import { difficultyPersonality } from '../../src/solo/difficulty';

describe('difficulty levels', () => {
  it.each(MODE_IDS)('mode %s: the hard bot beats the easy bot in most matches (whichever side it starts on)', (modeId) => {
    const easy = difficultyPersonality('leicht', modeId);
    const hard = difficultyPersonality('schwer', modeId);
    let hardWins = 0;
    let easyWins = 0;
    for (let seed = 1; seed <= 16; seed++) {
      const hardIsHost = seed % 2 === 0;
      const report = runSimulatedMatch({
        seed,
        mapId: seed % 4 < 2 ? 'schlucht' : 'arena',
        modeId,
        personalities: hardIsHost ? [hard, easy] : [easy, hard],
      });
      expect(findProblems({ matches: [report], server: null })).toEqual([]);
      if (report.winner === null || report.winner < 0) continue; // draw
      if ((report.winner === 0) === hardIsHost) hardWins++;
      else easyWins++;
    }
    expect(hardWins).toBeGreaterThanOrEqual(10);
    expect(hardWins).toBeGreaterThan(easyWins * 3);
  });
});
