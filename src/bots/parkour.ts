/**
 * Lets a bot take one parkour link of the map (see ParkourLink in shared/maps/mapTypes.ts):
 *   align -> turn into the direction of the link and step exactly onto its line
 *   run   -> run, and jump where the floor ends (or a ledge is in the way)
 *   air   -> steer through the air / hold forward along the wall until landing
 *
 * It only produces normal inputs, like a human would - the bot has no special powers.
 */
import type { MapDef, ParkourLink } from '../shared/maps/mapTypes';
import { angleDifference, clamp } from '../shared/math/scalar';
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
    // Jump: aim for the landing point (brake if we would fly too far).
    const remaining = (link.to.x - me.pos.x) * forward.x + (link.to.z - me.pos.z) * forward.z;
    const speed = me.vel.x * forward.x + me.vel.z * forward.z;
    const wanted = clamp(remaining * 4, -MOVE.runSpeed, MOVE.runSpeed);
    out.moveZ = speed < wanted - 0.5 ? 1 : speed > wanted + 0.5 ? -1 : 0;
    out.moveX = sidestep;
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
