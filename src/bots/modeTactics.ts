/**
 * How the bot adapts its fighting to the game mode. The personality (src/bots/brain.ts)
 * says how GOOD a bot is; the tactics say how it plays THIS mode's rules.
 *
 * The duel uses neutral tactics (all factors 1, all extras off), so duel bots behave
 * exactly as before the modes existed - the duel balance in BALANCE.md stays valid.
 */
import type { GameMode, ModeId } from '../shared/match/gameModes';

export interface ModeTactics {
  /** Multiplies the chance to parry an incoming swing. */
  parry: number;
  /** Multiplies the chance to dodge with a dash (a long dash cooldown makes dodging costly). */
  dodge: number;
  /** Multiplies the chance of a dash attack that is not a punish. */
  dashAttack: number;
  /** Do not swing while the enemy cannot be hit; wait until its invulnerability runs out. */
  waitOutInvulnerability: boolean;
  /** While the bot itself cannot be hit: attack more and do not bother defending. */
  pressWhileInvulnerable: boolean;
  /** After its own successful parry: strike with the punish chance (bonus damage). */
  useCounter: boolean;
}

const NEUTRAL: ModeTactics = {
  parry: 1,
  dodge: 1,
  dashAttack: 1,
  waitOutInvulnerability: false,
  pressWhileInvulnerable: false,
  useCounter: false,
};

export const MODE_TACTICS: Record<ModeId, ModeTactics> = {
  duel: NEUTRAL,
  arena: {
    parry: 1.3, // a parry earns a counter with double damage
    dodge: 0.6, // the dash recharges slowly - keep it for attacks
    dashAttack: 0.5, // hurts double, but the long recovery is easy to punish
    waitOutInvulnerability: true,
    pressWhileInvulnerable: true,
    useCounter: true,
  },
};

export function tacticsFor(mode: GameMode): ModeTactics {
  return MODE_TACTICS[mode.id];
}
