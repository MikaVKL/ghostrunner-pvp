/**
 * The combat part of the bot AI: when to swing, dash-attack, punish, parry or dodge.
 * All randomness comes from the brain's seeded generator, so a bot with the same seed in
 * the same situation does the same thing.
 *
 * What makes it feel less like a machine:
 *   - reaction time: it answers a swing only some ticks after seeing it (per difficulty)
 *   - it punishes: a stunned opponent or one recovering from a missed swing gets hit at once
 *   - it sometimes dodges with a dash instead of parrying
 *   - every round it picks a fighting style that shifts all of these chances
 */
import { currentAttack, isAttackActive } from '../shared/combat/actions';
import { getWeapon } from '../shared/combat/weapons';
import { TICK_DT } from '../shared/config';
import { Button } from '../shared/input';
import type { Rng } from '../shared/math/rng';
import { MOVE } from '../shared/movement/movementConfig';
import type { PlayerState } from '../shared/sim/playerState';
import type { BotPersonality } from './brain';

/** How far a dash carries the bot, in meters. */
const DASH_DISTANCE = MOVE.dashSpeed * MOVE.dashTicks * TICK_DT;

/** A fighting style multiplies the personality's chances for one round. */
export interface FightStyle {
  name: 'aggressive' | 'counter' | 'evasive';
  attack: number;
  parry: number;
  dodge: number;
}

export const FIGHT_STYLES: FightStyle[] = [
  { name: 'aggressive', attack: 1.6, parry: 0.6, dodge: 0.5 },
  { name: 'counter', attack: 0.6, parry: 1.4, dodge: 1 },
  { name: 'evasive', attack: 0.9, parry: 0.7, dodge: 2.2 },
];

export interface FightSituation {
  me: PlayerState;
  enemy: PlayerState;
  /** Horizontal distance between the two, in meters. */
  distance: number;
  /** How far the bot's view direction is off the enemy, in radians (0 = looking straight at it). */
  aimError: number;
  /** True if there is solid floor all the way to the enemy (checked only when needed). */
  pathIsSafe: () => boolean;
}

export interface FightPlan {
  /** Buttons (bit flags) to press this tick. */
  buttons: number;
  /** The bot wants to dash out of the way (the brain picks a safe direction). */
  dodge: boolean;
}

/** True while the opponent cannot defend itself: stunned, or its swing is over but not recovered. */
export function isOpen(enemy: PlayerState): boolean {
  if (enemy.action === 'stunned') return true;
  if (enemy.action !== 'attack') return false;
  const swing = currentAttack(enemy);
  return enemy.actionTicks >= swing.startupTicks + swing.activeTicks;
}

export class FightHabits {
  style: FightStyle = FIGHT_STYLES[0];
  /** Counters for the bot report. */
  readonly stats = { dodges: 0, punishes: 0 };
  private ticks = 0;
  /** Tick at which the enemy's current swing was first seen (null = no swing). */
  private swingSeenAt: number | null = null;
  private answeredSwing = false;

  constructor(
    private readonly rng: Rng,
    private readonly personality: BotPersonality,
  ) {}

  /** Pick a new fighting style (call at the start of every round). */
  newRound(): void {
    this.style = FIGHT_STYLES[Math.floor(this.rng() * FIGHT_STYLES.length)];
    this.swingSeenAt = null;
    this.answeredSwing = false;
  }

  decide(s: FightSituation): FightPlan {
    this.ticks++;
    const defense = this.decideDefense(s);
    return { buttons: this.decideAttack(s) | defense.buttons, dodge: defense.dodge };
  }

  private decideAttack({ me, enemy, distance, aimError, pathIsSafe }: FightSituation): number {
    if (me.action !== 'idle' || me.attackCooldown > 0) return 0;
    const { light, dash } = getWeapon(me.weaponId).attacks;
    const open = isOpen(enemy);
    if (aimError < 0.5 && distance < light.range) {
      // An opponent that cannot defend itself is hit at once ("punish").
      const chance = open ? this.personality.punishChance : this.personality.attackChance * this.style.attack;
      if (this.rng() >= chance) return 0;
      if (open) this.stats.punishes++;
      return Button.Attack;
    }
    // Dash attack: close a gap of a few meters, but never dash into the void.
    const dashReach = DASH_DISTANCE + dash.range - 0.5;
    const sameLevel = Math.abs(enemy.pos.y - me.pos.y) < 1;
    if (aimError < 0.2 && distance < dashReach && me.dashCooldown === 0 && me.grounded && sameLevel) {
      const chance = open ? this.personality.punishChance : this.personality.dashAttackChance * this.style.attack;
      if (this.rng() < chance && pathIsSafe()) {
        if (open) this.stats.punishes++;
        return Button.Dash | Button.Attack;
      }
    }
    return 0;
  }

  /** Answer each enemy swing once, after the reaction time: parry, dodge, or nothing. */
  private decideDefense({ me, enemy, distance }: FightSituation): FightPlan {
    const nothing = { buttons: 0, dodge: false };
    if (enemy.action !== 'attack' || isOpen(enemy)) {
      this.swingSeenAt = null;
      this.answeredSwing = false;
      return nothing;
    }
    this.swingSeenAt ??= this.ticks;
    if (this.answeredSwing || this.ticks - this.swingSeenAt < this.personality.reactionTicks) return nothing;
    // A swing that is still out of reach (a dash attack coming in) is answered once it gets close.
    const reach = getWeapon(enemy.weaponId).attacks[enemy.attackKind].range + 1.5;
    if (distance > reach) return nothing;
    this.answeredSwing = true;
    if (isAttackActive(me)) return nothing;

    const roll = this.rng();
    const parry = Math.min(0.97, this.personality.parryChance * this.style.parry);
    const dodge = this.personality.dodgeChance * this.style.dodge;
    if (roll < parry) {
      return me.action === 'idle' && me.parryCooldown === 0 ? { buttons: Button.Parry, dodge: false } : nothing;
    }
    if (roll < parry + dodge && me.dashCooldown === 0 && me.action !== 'stunned') {
      this.stats.dodges++;
      return { buttons: 0, dodge: true };
    }
    return nothing;
  }
}
