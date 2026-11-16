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
import type { MapDef } from '../shared/maps/mapTypes';
import { createRng, type Rng } from '../shared/math/rng';
import { angleDifference, clamp } from '../shared/math/scalar';
import { forwardFromYaw, horizontalDistance, yawToward, type Vec3 } from '../shared/math/vec3';
import { getWeapon } from '../shared/combat/weapons';
import type { PlayerState } from '../shared/sim/playerState';
import { FightHabits } from './brainFight';
import { ButtonHolder } from './buttonHolder';
import { ARRIVE_DISTANCE, canStandAt, isWalkable, planRoute, type NavStep } from './nav';
import { LinkRunner } from './parkour';

/** Closer than this, the bot looks at the enemy instead of at its waypoint. */
const FIGHT_DISTANCE = 6.5;
const REPATH_EVERY_TICKS = 10;
/** How far ahead the bot checks for floor before walking. */
const LEDGE_LOOKAHEAD = 0.9;
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

  /** Decide the input for this tick. `enemy` is null while alone in the room. */
  think(me: PlayerState, enemy: PlayerState | null, map: MapDef): InputSample {
    this.ticks++;
    if (!this.hasYaw) {
      this.yaw = me.yaw;
      this.hasYaw = true;
    }
    this.noticeRespawn(me);
    if (this.runner) return this.followLink(me, map, this.runner);

    const target = enemy && enemy.alive ? enemy : null;
    const distance = target ? horizontalDistance(me.pos, target.pos) : Infinity;
    const fighting = target !== null && distance < FIGHT_DISTANCE;
    const range = getWeapon(me.weaponId).attacks.light.range;

    // Where to go and where to look.
    if (!this.route || this.ticks % REPATH_EVERY_TICKS === 0) {
      const goal = target ? target.pos : this.wanderTarget(map);
      this.route = planRoute(map, me.pos, goal, this.personality.linkCost);
    }
    const waypoint = this.route.target;
    const toWaypoint = horizontalDistance(me.pos, waypoint);
    if (this.route.link && me.grounded && toWaypoint < ARRIVE_DISTANCE) {
      this.runner = new LinkRunner(this.route.link);
      return this.followLink(me, map, this.runner);
    }
    const lookAt = fighting ? target.pos : waypoint;
    const turn = this.turnToward(horizontalDistance(me.pos, lookAt) > 0.3 ? yawToward(me.pos, lookAt) : this.yaw);

    // Movement: walk forward when roughly facing the goal (and coast the last half meter
    // so the bot stops ON the waypoint); circle the enemy when close.
    const speed = Math.hypot(me.vel.x, me.vel.z);
    const wantsForward = toWaypoint > 0.5 || (speed < 2 && toWaypoint > 0.15);
    let moveZ = Math.abs(turn) < 0.6 && wantsForward ? 1 : 0;
    let moveX = 0;
    if (fighting && distance < range * 0.75) {
      moveZ = 0;
      if (this.rng() < 0.03) this.strafe = -this.strafe;
      moveX = this.strafe;
    }
    ({ moveX, moveZ } = this.avoidLedges(me, map, moveX, moveZ, fighting ? LEDGE_LOOKAHEAD : toWaypoint));

    if (fighting) {
      const aimError = Math.abs(angleDifference(this.yaw, yawToward(me.pos, target.pos)));
      const pathIsSafe = () => isWalkable(map, me.pos, target.pos);
      this.buttons.press(this.fight.decide({ me, enemy: target, distance, aimError, pathIsSafe }));
    }
    this.moveRandomly(me, map, moveZ);
    this.unstick(me, moveX !== 0 || moveZ !== 0);

    return { moveX, moveZ, yaw: this.yaw, pitch: 0, buttons: this.buttons.current() };
  }

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
  }

  /** Random jumps and dashes so that all movement code gets exercised. */
  private moveRandomly(me: PlayerState, map: MapDef, moveZ: number): void {
    if (me.grounded && this.rng() < this.personality.jumpChance) this.buttons.press(Button.Jump);
    if (moveZ > 0 && this.rng() < this.personality.dashChance) {
      // Only dash if the landing spot (about 3.5 m ahead) has floor. Mostly.
      const forward = forwardFromYaw(this.yaw);
      const safe = canStandAt(map, me.pos.x + forward.x * 3.5, me.pos.z + forward.z * 3.5, me.pos.y);
      if (safe || this.rng() < 0.1) this.buttons.press(Button.Dash);
    }
  }

  /** Do not walk into the void: cancel movement toward a spot without floor. */
  private avoidLedges(me: PlayerState, map: MapDef, moveX: number, moveZ: number, forwardRoom: number) {
    if (!me.grounded) return { moveX, moveZ };
    const forward = forwardFromYaw(this.yaw);
    const ahead = (fx: number, fz: number, distance: number) =>
      canStandAt(map, me.pos.x + fx * distance, me.pos.z + fz * distance, me.pos.y);
    // Never look further ahead than the waypoint itself (it may be right next to a ledge).
    const lookahead = Math.min(LEDGE_LOOKAHEAD, forwardRoom);
    if (moveZ !== 0 && !ahead(forward.x * moveZ, forward.z * moveZ, lookahead)) moveZ = 0;
    // The right vector is the forward vector rotated by 90 degrees.
    if (moveX !== 0 && !ahead(-forward.z * moveX, forward.x * moveX, LEDGE_LOOKAHEAD)) {
      this.strafe = -this.strafe;
      moveX = 0;
    }
    return { moveX, moveZ };
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
