/**
 * Bot AI: looks at the game state and decides which buttons to press this tick.
 * It produces the same kind of input a human produces - bots have no special powers.
 *
 * Behavior: go to the opponent (path finding in nav.ts, parkour shortcuts in parkour.ts),
 * fight when close (brainFight.ts), sometimes jump or dash for variety.
 * All randomness comes from a seeded generator, so a bot with the same seed in the same
 * situation always does the same thing.
 */
import { Button, type InputSample } from '../shared/input';
import type { MapDef, ParkourLink } from '../shared/maps/mapTypes';
import { createRng, type Rng } from '../shared/math/rng';
import { angleDifference, clamp } from '../shared/math/scalar';
import { forwardFromYaw, horizontalDistance, yawToward, type Vec3 } from '../shared/math/vec3';
import { getWeapon } from '../shared/combat/weapons';
import { MOVE } from '../shared/movement/movementConfig';
import type { PlayerState } from '../shared/sim/playerState';
import { FightHabits } from './brainFight';
import { ButtonHolder } from './buttonHolder';
import { ARRIVE_DISTANCE, canStandAt, isWalkable, nearestStandable, planRoute, type NavStep } from './nav';
import { LinkRunner } from './parkour';
import { directionOf, directionTo, keysFor, NO_KEYS, type Direction, type MoveKeys } from './steering';

/** Closer than this, the bot looks at the enemy instead of at its waypoint. */
const FIGHT_DISTANCE = 6.5;
const REPATH_EVERY_TICKS = 10;
/** Closer than this many sword lengths, the bot does its close-combat footwork. */
const FOOTWORK_DISTANCE = 1.5;
/** How far ahead the bot checks for floor before walking. */
const LEDGE_LOOKAHEAD = 0.9;
/** Seconds a normal jump stays in the air (up and down again). */
const JUMP_AIR_TIME = (2 * MOVE.jumpSpeed) / MOVE.gravity;
/** A position change larger than this in one tick means "respawned". */
const TELEPORT_DISTANCE = 3;

export interface BotPersonality {
  /** Fastest the bot can turn, in radians per tick (0.2 = a half turn in a quarter second). */
  turnSpeed: number;
  /** Chance per tick to start a swing when the enemy is in range. */
  attackChance: number;
  /** Chance per tick to start a dash attack when the enemy is a few meters away. */
  dashAttackChance: number;
  /** Chance to try a parry when the enemy starts a swing. */
  parryChance: number;
  /** Chance to dash out of the way instead (only if the parry roll failed). */
  dodgeChance: number;
  /** Chance per tick to hit an opponent that is stunned or recovering from a missed swing. */
  punishChance: number;
  /** Ticks between seeing a swing start and reacting to it (6 ticks = 0.1 s). */
  reactionTicks: number;
  /** Chance per tick for a random jump / dash. */
  jumpChance: number;
  dashChance: number;
  /** Chance per tick to jump off the wall during a wall-run (only where it is safe). */
  wallJumpChance: number;
  /** Path finding: parkour links count as this much shorter/longer (< 1 = loves parkour). */
  linkCost: number;
}

export const DEFAULT_PERSONALITY: BotPersonality = {
  turnSpeed: 0.2,
  attackChance: 0.12,
  dashAttackChance: 0.05,
  parryChance: 0.4,
  dodgeChance: 0.15,
  punishChance: 0.3,
  reactionTicks: 6,
  jumpChance: 0.006,
  dashChance: 0.006,
  wallJumpChance: 0.04,
  linkCost: 0.6,
};

export class BotBrain {
  private readonly rng: Rng;
  private readonly fight: FightHabits;
  private yaw = 0;
  private hasYaw = false;
  private route: NavStep | null = null;
  /** Set while the bot is taking a parkour link. */
  private runner: LinkRunner | null = null;
  private ticks = 0;
  private readonly buttons = new ButtonHolder();
  private strafe = 1;
  /**
   * How much the bot likes each parkour link THIS round. Re-rolled every round, so it
   * takes the bridge once, a wall-run the next time, then the jump pad.
   */
  private linkMood = new Map<ParkourLink, number>();
  /** Current close-combat step (see `footwork`) and how many ticks it still lasts. */
  private step: 'circle' | 'back' | 'in' = 'circle';
  private stepTicks = 0;
  private stuckChecks = 0;
  private stuckPos: Vec3 | null = null;
  private lastPos: Vec3 | null = null;

  constructor(
    seed: number,
    private readonly personality: BotPersonality = DEFAULT_PERSONALITY,
  ) {
    this.rng = createRng(seed);
    this.fight = new FightHabits(this.rng, personality);
  }

  /**
   * Decide the input for this tick. `enemy` is null while alone in the room.
   * @param canAct false while the player is frozen (countdown, round over, dead)
   */
  think(me: PlayerState, enemy: PlayerState | null, map: MapDef, canAct = true): InputSample {
    this.ticks++;
    if (!this.hasYaw) {
      this.yaw = me.yaw;
      this.hasYaw = true;
    }
    this.noticeRespawn(me);
    if (!canAct) return this.waitFrozen(me, enemy);
    if (this.runner) return this.followLink(me, map, this.runner);

    const target = enemy && enemy.alive ? enemy : null;
    const distance = target ? horizontalDistance(me.pos, target.pos) : Infinity;
    const fighting = target !== null && distance < FIGHT_DISTANCE;
    const range = getWeapon(me.weaponId).attacks.light.range;

    // Where to go and where to look.
    if (!this.route || this.ticks % REPATH_EVERY_TICKS === 0) {
      const goal = target ? target.pos : this.wanderTarget(map);
      this.route = planRoute(map, me.pos, goal, this.linkCostNow);
    }
    // Standing on the very edge of a platform, no line counts as walkable: step back onto safe ground first.
    const onEdge = me.grounded && !canStandAt(map, me.pos.x, me.pos.z, me.pos.y);
    const safeSpot = onEdge ? nearestStandable(map, me.pos) : null;
    if (safeSpot) this.route = { target: safeSpot, link: null };
    const waypoint = this.route.target;
    const toWaypoint = horizontalDistance(me.pos, waypoint);
    if (this.route.link && me.grounded && toWaypoint < ARRIVE_DISTANCE) {
      this.runner = new LinkRunner(this.route.link);
      return this.followLink(me, map, this.runner);
    }
    const lookAt = fighting ? target.pos : waypoint;
    const turn = this.turnToward(horizontalDistance(me.pos, lookAt) > 0.3 ? yawToward(me.pos, lookAt) : this.yaw);

    // Where to walk - decided separately from where to look, so the bot can keep its eyes
    // on the opponent while going around an obstacle. Coast the last half meter so it stops
    // ON the waypoint; circle the enemy when close.
    const speed = Math.hypot(me.vel.x, me.vel.z);
    const wantsToWalk = toWaypoint > 0.5 || (speed < 2 && toWaypoint > 0.15);
    let wish = wantsToWalk ? directionTo(me.pos, waypoint) : null;
    if (!fighting && Math.abs(turn) >= 0.6) wish = null; // outside a fight: turn first, then walk
    // Footwork only on solid ground with a clear, safe line to the opponent - otherwise keep following the route.
    const closeCombat = fighting && me.grounded && distance < range * FOOTWORK_DISTANCE;
    if (closeCombat && isWalkable(map, me.pos, target.pos)) wish = this.footwork(me, target, distance, range);
    let keys = keysFor(wish, this.yaw);
    if (!safeSpot) keys = this.avoidLedges(me, map, keys, fighting ? LEDGE_LOOKAHEAD : toWaypoint);

    if (fighting) {
      const aimError = Math.abs(angleDifference(this.yaw, yawToward(me.pos, target.pos)));
      const pathIsSafe = () => isWalkable(map, me.pos, target.pos);
      const plan = this.fight.decide({ me, enemy: target, distance, aimError, pathIsSafe });
      this.buttons.press(plan.buttons);
      // A dash goes where the movement keys point: a dash attack must point at the enemy
      // (during footwork the keys may point backward - straight over an edge).
      if (plan.buttons & Button.Dash) keys = keysFor(directionTo(me.pos, target.pos), this.yaw);
      if (plan.dodge) keys = this.dodge(me, target, map) ?? keys;
    }
    const { moveX, moveZ } = keys;
    // No stunts right before a parkour link or a narrow waypoint - they need a clean approach.
    if (!this.route.link && toWaypoint > 3) this.moveRandomly(me, map, moveZ);
    this.unstick(me, moveX !== 0 || moveZ !== 0);

    return { moveX, moveZ, yaw: this.yaw, pitch: 0, buttons: this.buttons.current() };
  }

  /**
   * Close combat movement: instead of only circling, the bot mixes circling, stepping
   * back out of reach and stepping in again - re-decided a few times per second.
   */
  private footwork(me: PlayerState, enemy: PlayerState, distance: number, range: number): Direction | null {
    const toEnemy = directionTo(me.pos, enemy.pos);
    if (!toEnemy) return null;
    if (--this.stepTicks <= 0) {
      this.stepTicks = 15 + Math.floor(this.rng() * 30);
      const roll = this.rng();
      this.step = roll < 0.45 ? 'circle' : roll < 0.75 ? 'back' : 'in';
      if (this.rng() < 0.4) this.strafe = -this.strafe;
    }
    const sideways = { x: -toEnemy.z * this.strafe, z: toEnemy.x * this.strafe };
    if (this.step === 'back' && distance < range * 1.3) return { x: -toEnemy.x, z: -toEnemy.z };
    if (this.step === 'in' && distance > range * 0.6) return toEnemy;
    return distance < range * 0.75 ? sideways : toEnemy;
  }

  /** Dash away from a swing: backward if there is floor, else to a side. Null = no safe way out. */
  private dodge(me: PlayerState, enemy: PlayerState, map: MapDef): MoveKeys | null {
    const toEnemy = directionTo(me.pos, enemy.pos);
    if (!toEnemy || !me.grounded) return null;
    const back = { x: -toEnemy.x, z: -toEnemy.z };
    const side = { x: -toEnemy.z * this.strafe, z: toEnemy.x * this.strafe };
    for (const dir of [back, side, { x: -side.x, z: -side.z }]) {
      const safe = [2, 3.5, 5].every((d) => canStandAt(map, me.pos.x + dir.x * d, me.pos.z + dir.z * d, me.pos.y));
      if (!safe) continue;
      this.buttons.press(Button.Dash);
      return keysFor(dir, this.yaw);
    }
    return null;
  }

  /**
   * Frozen (countdown, round over, dead): only look at the opponent. Nothing here may
   * count as "stuck" - otherwise the bot would jump the moment the round starts.
   */
  private waitFrozen(me: PlayerState, enemy: PlayerState | null): InputSample {
    this.stuckChecks = 0;
    this.stuckPos = null;
    this.route = null;
    this.runner = null;
    if (enemy && horizontalDistance(me.pos, enemy.pos) > 0.3) this.turnToward(yawToward(me.pos, enemy.pos));
    return { moveX: 0, moveZ: 0, yaw: this.yaw, pitch: 0, buttons: this.buttons.current() };
  }

  /** Cost of a parkour link for path finding: the personality's taste times this round's mood. */
  private linkCostNow = (link: ParkourLink): number => {
    let mood = this.linkMood.get(link);
    if (mood === undefined) {
      mood = 0.4 + this.rng() * 1.6;
      this.linkMood.set(link, mood);
    }
    return this.personality.linkCost * mood;
  };

  /** Let the LinkRunner steer until the parkour link is done. */
  private followLink(me: PlayerState, map: MapDef, runner: LinkRunner): InputSample {
    const mayWallJump = this.rng() < this.personality.wallJumpChance;
    const out = runner.step(me, map, this.yaw, mayWallJump);
    this.turnToward(out.yaw);
    if (out.jump) this.buttons.press(Button.Jump);
    if (out.done) {
      this.runner = null;
      this.route = null;
    }
    return { moveX: out.moveX, moveZ: out.moveZ, yaw: this.yaw, pitch: 0, buttons: this.buttons.current() };
  }

  /** Turn toward `desiredYaw` as fast as allowed. Returns how far off the bot was. */
  private turnToward(desiredYaw: number): number {
    const turn = angleDifference(this.yaw, desiredYaw);
    this.yaw += clamp(turn, -this.personality.turnSpeed, this.personality.turnSpeed);
    return turn;
  }

  /** After a death or respawn every plan is outdated. */
  private noticeRespawn(me: PlayerState): void {
    const jumped = this.lastPos !== null && horizontalDistance(me.pos, this.lastPos) > TELEPORT_DISTANCE;
    this.lastPos = { ...me.pos };
    if (!jumped && me.alive) return;
    this.runner = null;
    this.route = null;
    this.yaw = me.yaw;
    this.linkMood.clear(); // new round, new favorite routes
    this.fight.newRound(); // ... and a new fighting style
  }

  /** Counters of the fight habits (for the bot report). */
  get fightStats(): { dodges: number; punishes: number } {
    return this.fight.stats;
  }

  /** Random jumps and dashes for variety - but only where the bot will land on solid ground. */
  private moveRandomly(me: PlayerState, map: MapDef, moveZ: number): void {
    const landsSafely = (distance: number) => {
      const speed = Math.hypot(me.vel.x, me.vel.z) || 1;
      const x = me.pos.x + (me.vel.x / speed) * distance;
      const z = me.pos.z + (me.vel.z / speed) * distance;
      return canStandAt(map, x, z, me.pos.y);
    };
    if (me.grounded && this.rng() < this.personality.jumpChance) {
      // A jump carries the bot as far as it runs in the time it is in the air.
      const flight = Math.hypot(me.vel.x, me.vel.z) * JUMP_AIR_TIME;
      if (landsSafely(flight) && landsSafely(flight + 1)) this.buttons.press(Button.Jump);
    }
    if (moveZ > 0 && this.rng() < this.personality.dashChance) {
      const forward = forwardFromYaw(this.yaw);
      const safe = [2, 3.5, 5].every((d) => canStandAt(map, me.pos.x + forward.x * d, me.pos.z + forward.z * d, me.pos.y));
      if (safe) this.buttons.press(Button.Dash);
    }
  }

  /**
   * Do not walk into the void: if the spot ahead has no floor, try only one of the two
   * keys (sliding along the edge), otherwise stand still.
   */
  private avoidLedges(me: PlayerState, map: MapDef, keys: MoveKeys, room: number): MoveKeys {
    if (!me.grounded) return keys;
    // Never look further ahead than the waypoint itself (it may be right next to a ledge).
    const lookahead = Math.min(LEDGE_LOOKAHEAD, room);
    const isSafe = (candidate: MoveKeys) => {
      const dir = directionOf(candidate, this.yaw);
      return !dir || canStandAt(map, me.pos.x + dir.x * lookahead, me.pos.z + dir.z * lookahead, me.pos.y);
    };
    if (isSafe(keys)) return keys;
    this.strafe = -this.strafe;
    const forwardOnly = { moveX: 0, moveZ: keys.moveZ };
    const sideOnly = { moveX: keys.moveX, moveZ: 0 };
    if (keys.moveZ !== 0 && keys.moveX !== 0) {
      if (isSafe(forwardOnly)) return forwardOnly;
      if (isSafe(sideOnly)) return sideOnly;
    }
    return NO_KEYS;
  }

  /** If the bot wants to move but has not moved for a second, jump and turn a bit. */
  private unstick(me: PlayerState, wantsToMove: boolean): void {
    if (this.ticks % 60 !== 0) return;
    const moved = this.stuckPos ? horizontalDistance(me.pos, this.stuckPos) : 1;
    this.stuckPos = { ...me.pos };
    this.stuckChecks = wantsToMove && moved < 0.3 ? this.stuckChecks + 1 : 0;
    if (this.stuckChecks >= 2) {
      this.buttons.press(Button.Jump);
      this.strafe = -this.strafe;
      this.route = null;
    }
  }

  private wanderTarget(map: MapDef): Vec3 {
    const points = map.navPoints;
    if (points.length === 0) return map.spawns[0].pos;
    return points[Math.floor(this.ticks / 240) % points.length];
  }

}
