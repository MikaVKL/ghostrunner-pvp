/**
 * The three difficulty levels of the solo mode.
 *
 * A level is one number, the bot's SKILL between 0 (weakest) and 1 (strongest). All bot
 * parameters (see BotPersonality in src/bots/brain.ts) are blended between the two
 * extremes below. The skill values are not guessed: `npm run tune` lets the bots play
 * against each other and finds the values for the wanted win rates (see BALANCE.md).
 */
import { DEFAULT_PERSONALITY, type BotPersonality } from '../bots/brain';
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
    wallJumpChance: blend('wallJumpChance'),
    linkCost: blend('linkCost'),
  };
}

/**
 * Skill of each level. Found by `npm run tune` - run it again after changing the bot AI
 * or the combat rules and copy the values it prints into this table.
 */
export const SKILL: Record<Difficulty, number> = {
  leicht: 0.05,
  mittel: 0.08,
  schwer: 0.94,
};

export interface DifficultyLevel {
  /** Shown in the menu (German). */
  label: string;
  /** One sentence for the menu (German). */
  description: string;
  /** The bot's name in the HUD (only letters, digits and spaces survive the name filter). */
  botName: string;
  personality: BotPersonality;
}

export const DIFFICULTIES: Record<Difficulty, DifficultyLevel> = {
  leicht: {
    label: 'Leicht',
    description: 'Dreht sich langsam, zögert beim Zuschlagen, pariert fast nie.',
    botName: 'Bot Leicht',
    personality: personalityForSkill(SKILL.leicht),
  },
  mittel: {
    label: 'Mittel',
    description: 'Schlägt zügig zu, pariert manchmal und nutzt Abkürzungen.',
    botName: 'Bot Mittel',
    personality: personalityForSkill(SKILL.mittel),
  },
  schwer: {
    label: 'Schwer',
    description: 'Reagiert sofort, pariert die meisten Schläge und greift per Dash an.',
    botName: 'Bot Schwer',
    personality: personalityForSkill(SKILL.schwer),
  },
};

export function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === 'string' && Object.hasOwn(DIFFICULTIES, value);
}
