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
 *   - the game mode changes its tactics (modeTactics.ts), e.g. in the arena it parries
 *     more, uses its counter bonus and does not waste swings on an invulnerable enemy
 */
import { currentAttack, isAttackActive } from '../shared/combat/actions';
import { getWeapon } from '../shared/combat/weapons';
import { TICK_DT } from '../shared/config';
import { Button } from '../shared/input';
import type { Rng } from '../shared/math/rng';
import { COMBAT } from '../shared/combat/combatConfig';
import { canStartDash } from '../shared/movement/dash';
import { MOVE } from '../shared/movement/movementConfig';
import type { PlayerState } from '../shared/sim/playerState';
import type { BotPersonality } from './brain';
import type { ModeTactics } from './modeTactics';

/** How far a dash carries the bot, in meters. */
const DASH_DISTANCE = MOVE.dashSpeed * MOVE.dashTicks * TICK_DT;

/** A fighting style multiplies the personality's chances for one round. */
export interface FightStyle {
  name: 'aggressive' | 'counter' | 'evasive';
  attack: number;
  parry: number;
  block: number;
  dodge: number;
}

export const FIGHT_STYLES: FightStyle[] = [
  { name: 'aggressive', attack: 1.6, parry: 0.6, block: 0.6, dodge: 0.5 },
  { name: 'counter', attack: 0.6, parry: 1.4, block: 1.4, dodge: 1 },
  { name: 'evasive', attack: 0.9, parry: 0.7, block: 0.7, dodge: 2.2 },
];

/** Above this posture fraction the bot stops blocking (one more block might break it). */
const POSTURE_CAUTION = 0.6;
/** Guard up: only this close, with this chance per tick (times blockChance), for at least this long. */
const GUARD_UP_DISTANCE = 3.5;
const GUARD_UP_RATE = 0.03;
const GUARD_UP_MIN_TICKS = 20;

export interface FightSituation {
  me: PlayerState;
  enemy: PlayerState;
  /** Horizontal distance between the two, in meters. */
  distance: number;
  /** How far the bot's view direction is off the enemy, in radians (0 = looking straight at it). */
  aimError: number;
  /** True if there is solid floor all the way to the enemy (checked only when needed). */
  pathIsSafe: () => boolean;
  /** How to play the rules of the current game mode. */
  tactics: ModeTactics;
}

export interface FightPlan {
  /** Buttons (bit flags) to press this tick. */
  buttons: number;
  /** How long to hold them (default: a short tap). A block holds the guard key. */
  holdTicks?: number;
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

/** Ticks until the enemy's blade becomes dangerous (0 = it is already in its hit phase). */
function ticksUntilStrike(enemy: PlayerState): number {
  return Math.max(0, currentAttack(enemy).startupTicks - enemy.actionTicks);
}

/** A planned parry is pressed this many ticks before the end of the window would reach the strike. */
const PARRY_MARGIN = 3;

/** Ticks until the enemy's swing can no longer hit. */
function ticksUntilSwingEnds(enemy: PlayerState): number {
  const swing = currentAttack(enemy);
  return swing.startupTicks + swing.activeTicks - enemy.actionTicks;
}

export class FightHabits {
  style: FightStyle = FIGHT_STYLES[0];
  /** Counters for the bot report. */
  readonly stats = { dodges: 0, punishes: 0, blocks: 0 };
  private ticks = 0;
  /** Tick at which the enemy's current swing was first seen (null = no swing). */
  private swingSeenAt: number | null = null;
  private answeredSwing = false;
  /** The bot decided to parry this swing and waits for the right moment to press. */
  private parryPending = false;

  constructor(
    private readonly rng: Rng,
    private readonly personality: BotPersonality,
  ) {}

  /** Pick a new fighting style (call at the start of every round). */
  newRound(): void {
    this.style = FIGHT_STYLES[Math.floor(this.rng() * FIGHT_STYLES.length)];
    this.swingSeenAt = null;
    this.answeredSwing = false;
    this.parryPending = false;
  }

  decide(s: FightSituation): FightPlan {
    this.ticks++;
    const defense = this.decideDefense(s);
    const idleDefense = defense.buttons === 0 && !defense.dodge;
    const guard = idleDefense ? this.raiseGuard(s) : null;
    if (guard) return guard;
    return { ...defense, buttons: this.decideAttack(s) | defense.buttons };
  }

  /**
   * Guard up: close to an enemy that is not swinging (yet), the bot sometimes holds its
   * block for a moment - a swing that comes then is blocked (or, with good timing, parried).
   */
  private raiseGuard({ me, enemy, distance }: FightSituation): FightPlan | null {
    if (me.action !== 'idle' || enemy.action === 'attack' || isOpen(enemy) || distance > GUARD_UP_DISTANCE) return null;
    if (me.posture / COMBAT.postureMax >= POSTURE_CAUTION) return null;
    if (this.rng() >= this.personality.blockChance * this.style.block * GUARD_UP_RATE) return null;
    this.stats.blocks++;
    return { buttons: Button.Parry, dodge: false, holdTicks: GUARD_UP_MIN_TICKS + Math.floor(this.rng() * GUARD_UP_MIN_TICKS) };
  }

  private decideAttack({ me, enemy, distance, aimError, pathIsSafe, tactics }: FightSituation): number {
    if (me.action !== 'idle' || me.attackCooldown > 0) return 0;
    const { light, dash } = getWeapon(me.weaponId).attacks;
    // A swing that would land while the enemy cannot be hit is wasted (and leaves us open).
    if (tactics.waitOutInvulnerability && enemy.invulnerableTicks > light.startupTicks) return 0;
    // Our own parry counter (bonus damage) is used like a free hit.
    const open = isOpen(enemy) || (tactics.useCounter && me.counterTicks > 0);
    const eager = tactics.pressWhileInvulnerable && me.invulnerableTicks > 0 ? 2 : 1;
    if (aimError < 0.5 && distance < light.range) {
      // An opponent that cannot defend itself is hit at once ("punish").
      const chance = open ? this.personality.punishChance : this.personality.attackChance * this.style.attack * eager;
      if (this.rng() >= chance) return 0;
      if (open) this.stats.punishes++;
      return Button.Attack;
    }
    // Dash attack: close a gap of a few meters, but never dash into the void.
    const dashReach = DASH_DISTANCE + dash.range - 0.5;
    const sameLevel = Math.abs(enemy.pos.y - me.pos.y) < 1;
    if (aimError < 0.2 && distance < dashReach && canStartDash(me) && me.grounded && sameLevel) {
      const normal = this.personality.dashAttackChance * this.style.attack * tactics.dashAttack * eager;
      const chance = open ? this.personality.punishChance : normal;
      if (this.rng() < chance && pathIsSafe()) {
        if (open) this.stats.punishes++;
        return Button.Dash | Button.Attack;
      }
    }
    return 0;
  }

  /**
   * The parry window (0.15 s) is shorter than a wind-up: a planned parry is pressed only
   * when the blade is about to land. Until then: nothing.
   */
  private parryWhenDue(me: PlayerState, enemy: PlayerState): FightPlan {
    if (ticksUntilStrike(enemy) > COMBAT.parryWindowTicks - PARRY_MARGIN) return { buttons: 0, dodge: false };
    this.parryPending = false;
    const ready = me.action === 'idle' && me.parryCooldown === 0;
    return { buttons: ready ? Button.Parry : 0, dodge: false };
  }

  /** Answer each enemy swing once, after the reaction time: parry, block, dodge, or nothing. */
  private decideDefense({ me, enemy, distance, tactics }: FightSituation): FightPlan {
    const nothing = { buttons: 0, dodge: false };
    if (enemy.action !== 'attack' || isOpen(enemy)) {
      this.swingSeenAt = null;
      this.answeredSwing = false;
      this.parryPending = false;
      return nothing;
    }
    this.swingSeenAt ??= this.ticks;
    if (this.parryPending) return this.parryWhenDue(me, enemy);
    if (this.answeredSwing || this.ticks - this.swingSeenAt < this.personality.reactionTicks) return nothing;
    // A swing that is still out of reach (a dash attack coming in) is answered once it gets close.
    const reach = getWeapon(enemy.weaponId).attacks[enemy.attackKind].range + 1.5;
    if (distance > reach) return nothing;
    this.answeredSwing = true;
    if (isAttackActive(me)) return nothing;
    if (tactics.pressWhileInvulnerable && me.invulnerableTicks > ticksUntilSwingEnds(enemy)) return nothing;

    const roll = this.rng();
    const parry = Math.min(0.97, this.personality.parryChance * this.style.parry * tactics.parry);
    const postureOk = me.posture / COMBAT.postureMax < POSTURE_CAUTION;
    const block = postureOk ? this.personality.blockChance * this.style.block : 0;
    const dodge = this.personality.dodgeChance * this.style.dodge * tactics.dodge;
    if (roll < parry) {
      this.parryPending = true;
      return this.parryWhenDue(me, enemy);
    }
    if (roll < parry + block) {
      if (me.action !== 'idle') return nothing;
      // Press and hold until the swing is over: a lucky timing even parries.
      this.stats.blocks++;
      return { buttons: Button.Parry, dodge: false, holdTicks: ticksUntilSwingEnds(enemy) + 4 };
    }
    if (roll < parry + block + dodge && canStartDash(me) && me.action !== 'stunned') {
      this.stats.dodges++;
      return { buttons: 0, dodge: true };
    }
    return nothing;
  }
}
