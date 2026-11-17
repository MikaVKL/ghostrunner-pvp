/**
 * Game modes: the rules of a match as plain data. A room plays exactly one mode for its
 * whole life; server AND client know it (the client needs it for prediction, e.g. the
 * dash cooldown). See HOW_TO_EXTEND.md ("Neuer Spielmodus").
 *
 * Units: `lives` is the HP a player starts each round with, `damage` is the HP a hit
 * removes. With 1 life and 1 damage every hit kills (the classic duel).
 */
import { secondsToTicks } from '../config';
import type { AttackKind } from '../combat/weapons';
import { MOVE } from '../movement/movementConfig';
import type { MatchConfig } from './matchConfig';

export type ModeId = 'duel' | 'arena';

export interface GameMode {
  id: ModeId;
  /** Shown in the menu (German). */
  name: string;
  description: string;
  /** HP at the start of each round (1 = one-hit kill). */
  lives: number;
  /** HP removed by a hit, per attack kind. */
  damage: Record<AttackKind, number>;
  /** After a hit that does not kill: the target cannot be hit for this long. */
  invulnerableTicks: number;
  /** After a successful parry: the defender's next hit within this time does bonus damage. */
  parryCounterTicks: number;
  parryCounterBonus: number;
  /** Time from the start of one dash until the next dash is possible. */
  dashCooldownTicks: number;
  /** Added to the recovery of a dash attack (more risk for its higher damage). */
  dashAttackExtraRecoveryTicks: number;
  /** Round wins needed to take the match, hard round limit, maximum round length. */
  roundsToWin: number;
  maxRounds: number;
  roundTicks: number;
  /** Default of the "show wind-up" setting in this mode (the player can change it). */
  windupCueByDefault: boolean;
}

/** The original game: one hit kills, best-of-5. Must stay exactly like this. */
export const DUEL: GameMode = {
  id: 'duel',
  name: 'Duell',
  description: 'Ein Treffer tötet. Wer zuerst 3 Runden gewinnt, gewinnt das Match.',
  lives: 1,
  damage: { light: 1, dash: 1 },
  invulnerableTicks: 0,
  parryCounterTicks: 0,
  parryCounterBonus: 0,
  dashCooldownTicks: MOVE.dashCooldownTicks,
  dashAttackExtraRecoveryTicks: 0,
  roundsToWin: 3,
  maxRounds: 9,
  roundTicks: secondsToTicks(60),
  windupCueByDefault: false,
};

/**
 * Several lives per round. A hit costs one life, then the target is briefly invulnerable
 * (no instant follow-up kill). A parry earns a counter attack with bonus damage. The dash
 * attack hurts more but recovers longer, and the dash has a longer cooldown, so nobody can
 * just dash around forever ("kiting"). Best-of-3, wind-up cue on by default.
 */
export const ARENA_MODE: GameMode = {
  id: 'arena',
  name: 'Arena',
  description:
    '3 Leben pro Runde. Ein Parry gibt einen Konter mit doppeltem Schaden, der Dash-Angriff trifft doppelt. Best-of-3.',
  lives: 3,
  damage: { light: 1, dash: 2 },
  invulnerableTicks: secondsToTicks(0.75),
  parryCounterTicks: secondsToTicks(1.5),
  parryCounterBonus: 1,
  dashCooldownTicks: secondsToTicks(1.6),
  dashAttackExtraRecoveryTicks: secondsToTicks(0.2),
  roundsToWin: 2,
  maxRounds: 5,
  roundTicks: secondsToTicks(90),
  windupCueByDefault: true,
};

export const MODES: Record<ModeId, GameMode> = { duel: DUEL, arena: ARENA_MODE };
export const MODE_IDS = Object.keys(MODES) as ModeId[];
export const DEFAULT_MODE_ID: ModeId = 'duel';

export function isModeId(value: unknown): value is ModeId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(MODES, value);
}

export function getMode(id: string): GameMode {
  return isModeId(id) ? MODES[id] : MODES[DEFAULT_MODE_ID];
}

/**
 * The match config a room uses. A server started WITHOUT its own config takes the round
 * rules from the mode; an explicit config (tests: FAST_MATCH_CONFIG) keeps its own.
 */
export function matchConfigForMode(base: MatchConfig, mode: GameMode, useModeRounds: boolean): MatchConfig {
  if (!useModeRounds) return base;
  return { ...base, roundsToWin: mode.roundsToWin, maxRounds: mode.maxRounds, roundTicks: mode.roundTicks };
}
