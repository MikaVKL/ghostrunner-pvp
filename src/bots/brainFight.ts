/**
 * The combat part of the bot AI: when to swing, when to dash-attack, when to parry.
 * Returns the buttons to press this tick. All randomness comes from the brain's seeded
 * generator, so a bot with the same seed in the same situation does the same thing.
 */
import { isAttackActive } from '../shared/combat/actions';
import { getWeapon } from '../shared/combat/weapons';
import { Button } from '../shared/input';
import type { Rng } from '../shared/math/rng';
import { MOVE } from '../shared/movement/movementConfig';
import { TICK_DT } from '../shared/config';
import type { PlayerState } from '../shared/sim/playerState';
import type { BotPersonality } from './brain';

/** How far a dash carries the bot, in meters. */
const DASH_DISTANCE = MOVE.dashSpeed * MOVE.dashTicks * TICK_DT;

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

export class FightHabits {
  /** Remembers whether we already decided about the enemy's current swing. */
  private decidedOnSwing = false;

  constructor(
    private readonly rng: Rng,
    private readonly personality: BotPersonality,
  ) {}

  /** Buttons (bit flags) the bot wants to press this tick. */
  decide(s: FightSituation): number {
    return this.decideAttack(s) | this.decideParry(s);
  }

  private decideAttack({ me, enemy, distance, aimError, pathIsSafe }: FightSituation): number {
    if (me.action !== 'idle' || me.attackCooldown > 0) return 0;
    const { light, dash } = getWeapon(me.weaponId).attacks;
    if (aimError < 0.5 && distance < light.range) {
      return this.rng() < this.personality.attackChance ? Button.Attack : 0;
    }
    // Dash attack: close a gap of a few meters, but never dash into the void.
    const dashReach = DASH_DISTANCE + dash.range - 0.5;
    const sameLevel = Math.abs(enemy.pos.y - me.pos.y) < 1;
    if (aimError < 0.2 && distance < dashReach && me.dashCooldown === 0 && me.grounded && sameLevel) {
      if (this.rng() < this.personality.dashAttackChance && pathIsSafe()) return Button.Dash | Button.Attack;
    }
    return 0;
  }

  /** React once per enemy swing: maybe parry it. */
  private decideParry({ me, enemy, distance }: FightSituation): number {
    if (enemy.action !== 'attack') {
      this.decidedOnSwing = false;
      return 0;
    }
    const reach = getWeapon(enemy.weaponId).attacks[enemy.attackKind].range + 1.5;
    if (this.decidedOnSwing || isAttackActive(enemy) || distance > reach) return 0;
    this.decidedOnSwing = true;
    const canParry = me.action === 'idle' && me.parryCooldown === 0;
    return canParry && this.rng() < this.personality.parryChance ? Button.Parry : 0;
  }
}
