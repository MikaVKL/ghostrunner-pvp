/**
 * Bot AI: looks at the game state and decides which buttons to press this tick.
 * It produces the same kind of input a human produces - bots have no special powers.
 *
 * Behavior: walk toward the opponent (using nav points to avoid the void), attack when
 * in range, sometimes parry an incoming swing, sometimes jump or dash for variety.
 * All randomness comes from a seeded generator, so a bot with the same seed in the same
 * situation always does the same thing.
 */
import { isAttackActive } from '../shared/combat/actions';
import { getWeapon } from '../shared/combat/weapons';
import { Button, type InputSample } from '../shared/input';
import type { MapDef } from '../shared/maps/mapTypes';
import { createRng, type Rng } from '../shared/math/rng';
import { angleDifference, clamp } from '../shared/math/scalar';
import { forwardFromYaw, horizontalDistance, yawToward, type Vec3 } from '../shared/math/vec3';
import type { PlayerState } from '../shared/sim/playerState';
import { canStandAt, nextWaypoint } from './nav';

/** Fastest the bot can turn, in radians per tick. */
const MAX_TURN_PER_TICK = 0.2;
/** Closer than this, the bot looks at the enemy instead of at its waypoint. */
const FIGHT_DISTANCE = 4.5;
const REPATH_EVERY_TICKS = 10;
/** How far ahead the bot checks for floor before walking. */
const LEDGE_LOOKAHEAD = 0.9;

export interface BotPersonality {
  /** Chance per tick to start a swing when the enemy is in range. */
  attackChance: number;
  /** Chance to try a parry when the enemy starts a swing. */
  parryChance: number;
  /** Chance per tick for a random jump / dash. */
  jumpChance: number;
  dashChance: number;
}

export const DEFAULT_PERSONALITY: BotPersonality = {
  attackChance: 0.12,
  parryChance: 0.4,
  jumpChance: 0.006,
  dashChance: 0.006,
};

export class BotBrain {
  private readonly rng: Rng;
  private yaw = 0;
  private hasYaw = false;
  private waypoint: Vec3 | null = null;
  private ticks = 0;
  /** Buttons that are being held, with the number of ticks left. */
  private held = new Map<number, number>();
  private strafe = 1;
  /** Remembers whether we already decided about the enemy's current swing. */
  private decidedOnSwing = false;
  private stuckTicks = 0;
  private lastPos: Vec3 | null = null;

  constructor(
    seed: number,
    private readonly personality: BotPersonality = DEFAULT_PERSONALITY,
  ) {
    this.rng = createRng(seed);
  }

  /** Decide the input for this tick. `enemy` is null while alone in the room. */
  think(me: PlayerState, enemy: PlayerState | null, map: MapDef): InputSample {
    this.ticks++;
    if (!this.hasYaw) {
      this.yaw = me.yaw;
      this.hasYaw = true;
    }
    const target = enemy && enemy.alive ? enemy : null;
    const distance = target ? horizontalDistance(me.pos, target.pos) : Infinity;
    const fighting = target !== null && distance < FIGHT_DISTANCE;
    const range = getWeapon(me.weaponId).attacks.light.range;

    // Where to go and where to look.
    if (!this.waypoint || this.ticks % REPATH_EVERY_TICKS === 0) {
      this.waypoint = nextWaypoint(map, me.pos, target ? target.pos : this.wanderTarget(map));
    }
    const lookAt = fighting ? target.pos : this.waypoint;
    const desiredYaw = horizontalDistance(me.pos, lookAt) > 0.3 ? yawToward(me.pos, lookAt) : this.yaw;
    const turn = angleDifference(this.yaw, desiredYaw);
    this.yaw += clamp(turn, -MAX_TURN_PER_TICK, MAX_TURN_PER_TICK);

    // Movement: walk forward when roughly facing the goal; circle the enemy when close.
    let moveZ = Math.abs(turn) < 0.6 && horizontalDistance(me.pos, this.waypoint) > 0.4 ? 1 : 0;
    let moveX = 0;
    if (fighting && distance < range * 0.75) {
      moveZ = 0;
      if (this.rng() < 0.03) this.strafe = -this.strafe;
      moveX = this.strafe;
    }
    ({ moveX, moveZ } = this.avoidLedges(me, map, moveX, moveZ));

    if (fighting) this.fight(me, target, distance, range);
    this.moveRandomly(me, map, moveZ);
    this.unstick(me, moveX !== 0 || moveZ !== 0);

    return { moveX, moveZ, yaw: this.yaw, pitch: 0, buttons: this.heldButtons() };
  }

  private fight(me: PlayerState, enemy: PlayerState, distance: number, range: number): void {
    const facing = Math.abs(angleDifference(this.yaw, yawToward(me.pos, enemy.pos))) < 0.5;
    if (me.action === 'idle' && facing && distance < range && this.rng() < this.personality.attackChance) {
      this.press(Button.Attack);
    }
    // React once per enemy swing: maybe parry it.
    if (enemy.action !== 'attack') {
      this.decidedOnSwing = false;
    } else if (!this.decidedOnSwing && !isAttackActive(enemy) && distance < range + 1.5) {
      this.decidedOnSwing = true;
      if (me.action === 'idle' && this.rng() < this.personality.parryChance) this.press(Button.Parry);
    }
  }

  /** Random jumps and dashes so that all movement code gets exercised. */
  private moveRandomly(me: PlayerState, map: MapDef, moveZ: number): void {
    if (me.grounded && this.rng() < this.personality.jumpChance) this.press(Button.Jump);
    if (moveZ > 0 && this.rng() < this.personality.dashChance) {
      // Only dash if the landing spot (about 3.5 m ahead) has floor. Mostly.
      const forward = forwardFromYaw(this.yaw);
      const safe = canStandAt(map, me.pos.x + forward.x * 3.5, me.pos.z + forward.z * 3.5, me.pos.y);
      if (safe || this.rng() < 0.1) this.press(Button.Dash);
    }
  }

  /** Do not walk into the void: cancel movement toward a spot without floor. */
  private avoidLedges(me: PlayerState, map: MapDef, moveX: number, moveZ: number) {
    if (!me.grounded) return { moveX, moveZ };
    const forward = forwardFromYaw(this.yaw);
    const ahead = (fx: number, fz: number) =>
      canStandAt(map, me.pos.x + fx * LEDGE_LOOKAHEAD, me.pos.z + fz * LEDGE_LOOKAHEAD, me.pos.y);
    if (moveZ !== 0 && !ahead(forward.x * moveZ, forward.z * moveZ)) moveZ = 0;
    // The right vector is the forward vector rotated by 90 degrees.
    if (moveX !== 0 && !ahead(-forward.z * moveX, forward.x * moveX)) {
      this.strafe = -this.strafe;
      moveX = 0;
    }
    return { moveX, moveZ };
  }

  /** If the bot wants to move but has not moved for a second, jump and turn a bit. */
  private unstick(me: PlayerState, wantsToMove: boolean): void {
    if (this.ticks % 60 !== 0) return;
    const moved = this.lastPos ? horizontalDistance(me.pos, this.lastPos) : 1;
    this.lastPos = { ...me.pos };
    this.stuckTicks = wantsToMove && moved < 0.3 ? this.stuckTicks + 1 : 0;
    if (this.stuckTicks >= 2) {
      this.press(Button.Jump);
      this.strafe = -this.strafe;
      this.waypoint = null;
    }
  }

  private wanderTarget(map: MapDef): Vec3 {
    const points = map.navPoints;
    if (points.length === 0) return map.spawns[0].pos;
    return points[Math.floor(this.ticks / 240) % points.length];
  }

  private press(button: number, ticks = 3): void {
    this.held.set(button, ticks);
  }

  /** Combine all currently held buttons and count their timers down. */
  private heldButtons(): number {
    let buttons = 0;
    for (const [button, left] of this.held) {
      buttons |= button;
      if (left <= 1) this.held.delete(button);
      else this.held.set(button, left - 1);
    }
    return buttons;
  }
}
