/**
 * The three difficulty levels of the solo mode.
 *
 * A level is one number, the bot's SKILL between 0 (weakest) and 1 (strongest). All bot
 * parameters (see BotPersonality in src/bots/brain.ts) are blended between the two
 * extremes below. The skill values are not guessed: `npm run tune` lets the bots play
 * against each other and finds the values for the wanted win rates (see BALANCE.md).
 * Every game mode has its own values: the same bot is stronger or weaker under other rules.
 */
import { DEFAULT_PERSONALITY, type BotPersonality } from '../bots/brain';
import type { ModeId } from '../shared/match/gameModes';
import { lerp } from '../shared/math/scalar';

export type Difficulty = 'leicht' | 'mittel' | 'schwer';

export const DEFAULT_DIFFICULTY: Difficulty = 'mittel';

/** Skill 0: turns slowly, hesitates, almost never parries, prefers the safe way. */
const WEAKEST: BotPersonality = {
  ...DEFAULT_PERSONALITY,
  turnSpeed: 0.05,
  attackChance: 0.02,
  dashAttackChance: 0.002,
  parryChance: 0.02,
  dodgeChance: 0.02,
  punishChance: 0.03,
  reactionTicks: 16,
  wallJumpChance: 0,
  linkCost: 1.6,
};

/** Skill 1: reacts at once, parries nearly everything, attacks by dash, loves parkour. */
const STRONGEST: BotPersonality = {
  ...DEFAULT_PERSONALITY,
  turnSpeed: 0.3,
  attackChance: 0.3,
  dashAttackChance: 0.1,
  parryChance: 0.95,
  dodgeChance: 0.3,
  punishChance: 0.7,
  reactionTicks: 3,
  wallJumpChance: 0.05,
  linkCost: 0.5,
};

/** The bot parameters for a skill between 0 and 1. */
export function personalityForSkill(skill: number): BotPersonality {
  const s = Math.min(1, Math.max(0, skill));
  const blend = (key: keyof BotPersonality) => lerp(WEAKEST[key], STRONGEST[key], s);
  return {
    ...DEFAULT_PERSONALITY,
    turnSpeed: blend('turnSpeed'),
    attackChance: blend('attackChance'),
    dashAttackChance: blend('dashAttackChance'),
    parryChance: blend('parryChance'),
    dodgeChance: blend('dodgeChance'),
    punishChance: blend('punishChance'),
    reactionTicks: Math.round(blend('reactionTicks')),
    wallJumpChance: blend('wallJumpChance'),
    linkCost: blend('linkCost'),
  };
}

/**
 * Skill of each level, per game mode. Found by `npm run tune` - run it again after
 * changing the bot AI or the combat rules and copy the values it prints into this table.
 */
export const SKILL: Record<ModeId, Record<Difficulty, number>> = {
  duel: { leicht: 0.05, mittel: 0.09, schwer: 0.55 },
  arena: { leicht: 0.05, mittel: 0.11, schwer: 0.5 },
};

/** The bot parameters of a difficulty level in a game mode. */
export function difficultyPersonality(level: Difficulty, modeId: ModeId): BotPersonality {
  return personalityForSkill(SKILL[modeId][level]);
}

export interface DifficultyLevel {
  /** Shown in the menu (German). */
  label: string;
  /** One sentence for the menu (German). */
  description: string;
  /** The bot's name in the HUD (only letters, digits and spaces survive the name filter). */
  botName: string;
}

export const DIFFICULTIES: Record<Difficulty, DifficultyLevel> = {
  leicht: {
    label: 'Leicht',
    description: 'Dreht sich langsam, zögert beim Zuschlagen, pariert fast nie.',
    botName: 'Bot Leicht',
  },
  mittel: {
    label: 'Mittel',
    description: 'Schlägt zügig zu, pariert manchmal und nutzt Abkürzungen.',
    botName: 'Bot Mittel',
  },
  schwer: {
    label: 'Schwer',
    description: 'Reagiert sofort, pariert die meisten Schläge und greift per Dash an.',
    botName: 'Bot Schwer',
  },
};

export function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === 'string' && Object.hasOwn(DIFFICULTIES, value);
}
