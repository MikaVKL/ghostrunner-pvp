/**
 * The three difficulty levels of the solo mode. A level is nothing but a set of bot
 * parameters (see BotPersonality in src/bots/brain.ts) - change the numbers to tune it.
 */
import { DEFAULT_PERSONALITY, type BotPersonality } from '../bots/brain';

export type Difficulty = 'leicht' | 'mittel' | 'schwer';

export const DEFAULT_DIFFICULTY: Difficulty = 'mittel';

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
    personality: {
      ...DEFAULT_PERSONALITY,
      turnSpeed: 0.06,
      attackChance: 0.025,
      dashAttackChance: 0.003,
      parryChance: 0.05,
      wallJumpChance: 0,
      linkCost: 1.5, // prefers the safe way over parkour
    },
  },
  mittel: {
    label: 'Mittel',
    description: 'Schlägt zügig zu, pariert manchmal und nutzt Abkürzungen.',
    botName: 'Bot Mittel',
    personality: {
      ...DEFAULT_PERSONALITY,
      turnSpeed: 0.13,
      attackChance: 0.07,
      dashAttackChance: 0.02,
      parryChance: 0.3,
      linkCost: 0.8,
    },
  },
  schwer: {
    label: 'Schwer',
    description: 'Reagiert sofort, pariert die meisten Schläge und greift per Dash an.',
    botName: 'Bot Schwer',
    personality: {
      ...DEFAULT_PERSONALITY,
      turnSpeed: 0.25,
      attackChance: 0.22,
      dashAttackChance: 0.08,
      parryChance: 0.8,
      wallJumpChance: 0.05,
      linkCost: 0.5, // loves wall-runs
    },
  },
};

export function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === 'string' && Object.hasOwn(DIFFICULTIES, value);
}
