/**
 * Lets a bot take one parkour link of the map (see ParkourLink in shared/maps/mapTypes.ts):
 *   align -> turn into the direction of the link and step exactly onto its line
 *   run   -> run, and jump where the floor ends (or a ledge is in the way); a jump pad
 *            on the way simply throws the bot into the air
 *   air   -> steer through the air (with a double jump if needed) / hold forward along
 *            the wall until landing
 *
 * It only produces normal inputs, like a human would - the bot has no special powers.
 */
import type { MapDef, ParkourLink } from '../shared/maps/mapTypes';
import { angleDifference } from '../shared/math/scalar';
import { forwardFromYaw, rightFromYaw, yawToward } from '../shared/math/vec3';
import { MOVE } from '../shared/movement/movementConfig';
import type { PlayerState } from '../shared/sim/playerState';
import { canStandAt } from './nav';

/** Jump when there is no place to stand this far ahead. */
const JUMP_LOOKAHEAD = 0.6;
/** Allowed sideways distance from the link's line, in meters. */
const LINE_TOLERANCE = 0.04;
const ALIGNED_ANGLE = 0.02;
/** Give up after this many ticks (the bot got stuck somewhere). */
const TIMEOUT_TICKS = 300;

/**
 * Seconds until a flying player comes down to height `y` (0 if it is already below and
 * falling, or can never get there).
 */
function timeUntilHeight(me: PlayerState, y: number): number {
  const g = MOVE.gravity;
  const underRoot = me.vel.y * me.vel.y + 2 * g * (me.pos.y - y);
  return underRoot > 0 ? Math.max(0, (me.vel.y + Math.sqrt(underRoot)) / g) : 0;
}

export interface RunnerOutput {
  moveX: number;
  moveZ: number;
  /** The direction the bot must look in. */
  yaw: number;
  jump: boolean;
  /** True once the link is finished (landed) or was given up. */
  done: boolean;
}

export class LinkRunner {
  private phase: 'align' | 'run' | 'air' = 'align';
  private ticks = 0;
  private airTicks = 0;
  private readonly yaw: number;
  private readonly forward: { x: number; z: number };
  private readonly right: { x: number; z: number };

  constructor(readonly link: ParkourLink) {
    this.yaw = yawToward(link.from, link.to);
    this.forward = forwardFromYaw(this.yaw);
    this.right = rightFromYaw(this.yaw);
  }

  /**
   * @param currentYaw   where the bot looks right now (it can only turn so fast)
   * @param mayWallJump  the brain allows a wall-jump this tick (decided by its random generator)
   */
  step(me: PlayerState, map: MapDef, currentYaw: number, mayWallJump: boolean): RunnerOutput {
    this.ticks++;
    const out: RunnerOutput = { moveX: 0, moveZ: 0, yaw: this.yaw, jump: false, done: false };
    if (this.ticks > TIMEOUT_TICKS) return { ...out, done: true };

    const { link, forward, right } = this;
    // Sideways distance from the line of the link (positive = too far right).
    const sideways = (me.pos.x - link.from.x) * right.x + (me.pos.z - link.from.z) * right.z;
    const sidestep = sideways > LINE_TOLERANCE ? -1 : sideways < -LINE_TOLERANCE ? 1 : 0;
    const aligned = Math.abs(angleDifference(currentYaw, this.yaw)) < ALIGNED_ANGLE;

    if (this.phase === 'align') {
      if (!me.grounded) return { ...out, done: true }; // fell off before starting
      if (aligned) out.moveX = sidestep;
      if (aligned && sidestep === 0) this.phase = 'run';
      return out;
    }

    if (this.phase === 'run') {
      if (!me.grounded) {
        this.phase = 'air';
      } else {
        out.moveZ = 1;
        out.moveX = sidestep;
        const ahead = JUMP_LOOKAHEAD;
        out.jump = !canStandAt(map, me.pos.x + forward.x * ahead, me.pos.z + forward.z * ahead, me.pos.y);
        return out;
      }
    }

    // --- in the air ---
    this.airTicks++;
    if (me.grounded && this.airTicks > 2) return { ...out, done: true };
    if (link.kind === 'wallRun') {
      out.moveZ = 1;
      out.jump = mayWallJump && me.wallRunning && this.wallJumpIsSafe(me, map);
      return out;
    }
    // Jump, drop or jump pad: predict where the flight ends and steer so that it ends at `to`.
    const remaining = (link.to.x - me.pos.x) * forward.x + (link.to.z - me.pos.z) * forward.z;
    const speed = me.vel.x * forward.x + me.vel.z * forward.z;
    const flight = speed * timeUntilHeight(me, link.to.y); // meters until touchdown
    const miss = remaining - flight; // > 0: would land before `to`
    out.moveZ = miss > 0.4 ? 1 : miss < -0.4 ? -1 : 0;
    out.moveX = sidestep;
    // Double jump: if the first jump does not get high enough, or the flight would end in the void.
    const top = me.pos.y + (me.vel.y > 0 ? (me.vel.y * me.vel.y) / (2 * MOVE.gravity) : 0);
    const isClimb = link.to.y > link.from.y + 0.3;
    const tooLow = isClimb && top < link.to.y + 0.15 && me.vel.y < 1.5;
    const landsOnFloor = canStandAt(map, me.pos.x + forward.x * flight, me.pos.z + forward.z * flight, link.to.y);
    const tooShort = miss > 0.6 && me.vel.y < 0 && !landsOnFloor;
    out.jump = me.airJumpsLeft > 0 && this.airTicks > 3 && (tooLow || tooShort);
    return out;
  }

  /** A wall-jump pushes the bot away from the wall: only do it if there is floor to land on. */
  private wallJumpIsSafe(me: PlayerState, map: MapDef): boolean {
    const groundY = this.link.to.y;
    const spot = (along: number, away: number) =>
      canStandAt(
        map,
        me.pos.x + this.forward.x * along + me.wallNormalX * away,
        me.pos.z + this.forward.z * along + me.wallNormalZ * away,
        groundY,
      );
    return spot(1.5, 1) && spot(3, 2) && spot(4.5, 3) && spot(6, 4);
  }
}
