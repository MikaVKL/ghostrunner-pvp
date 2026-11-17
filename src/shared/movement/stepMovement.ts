/**
 * One tick of player movement. This is the single entry point for all movement code.
 * It runs on the server (authoritative) AND on the client (prediction) with identical results.
 */
import { TICK_DT } from '../config';
import { Button, isDown, wasPressed, type InputCmd } from '../input';
import type { MapDef } from '../maps/mapTypes';
import { moveAndCollide } from '../physics/collision';
import { heightOf } from '../physics/playerCollision';
import type { PlayerState } from '../sim/playerState';
import { stepDash, tryStartDash } from './dash';
import { applyJumpPads } from './jumpPad';
import { stepLocomotion, wishDirection } from './locomotion';
import { MOVE } from './movementConfig';
import { endSlide, stepSlide, tryStartSlide, updateCrouch } from './slide';
import { stepWallRun, updateWallRun } from './wallRun';

export interface MovementModifiers {
  /** Multiplier on run speed (e.g. < 1 while stunned). */
  speedFactor: number;
  /** False while the player may not dash (e.g. stunned). */
  canDash: boolean;
  /** Dash cooldown of the game mode (GameMode.dashCooldownTicks). */
  dashCooldownTicks: number;
}

/** Running speed for this tick: crouching, walking (walk key) or the default sprint. */
function topSpeed(p: PlayerState, input: InputCmd): number {
  if (p.crouching && p.grounded) return MOVE.crouchSpeed;
  return isDown(input, Button.Walk) ? MOVE.walkSpeed : MOVE.runSpeed;
}

/** What the movement did this tick (a jump or dash can cancel the recovery of a swing). */
export interface MovementResult {
  jumped: boolean;
  dashed: boolean;
}

export function stepMovement(
  p: PlayerState,
  input: InputCmd,
  map: MapDef,
  mods: MovementModifiers,
): MovementResult {
  p.yaw = input.yaw;
  p.pitch = input.pitch;
  if (p.dashCooldown > 0) p.dashCooldown--;
  if (p.wallCooldown > 0) p.wallCooldown--;
  if (p.slideCooldown > 0) p.slideCooldown--;

  const wish = wishDirection(input);
  const jumpPressed = p.bufferJump > 0; // a recent press (input buffer), see sim/inputBuffer.ts
  const crouchHeld = isDown(input, Button.Crouch);

  // 1) Decide the velocity for this tick (exactly one of: dash, slide, wall-run, normal).
  const dashed = tryStartDash(p, input, wish, mods);
  let jumped = false;
  if (p.dashTicks > 0) {
    endSlide(p);
    stepDash(p);
  } else {
    tryStartSlide(p, wasPressed(input, p.prevButtons, Button.Crouch));
    if (p.slideTicks > 0) {
      jumped = stepSlide(p, jumpPressed, crouchHeld);
    } else {
      updateWallRun(p, input, map);
      if (p.wallRunning) jumped = stepWallRun(p, jumpPressed);
      else jumped = stepLocomotion(p, wish, jumpPressed, topSpeed(p, input) * mods.speedFactor);
    }
  }
  if (jumped) p.bufferJump = 0;

  // 2) Apply the velocity and collide with the map (a crouching body is lower).
  const result = moveAndCollide(p.pos, p.vel, map.boxes, TICK_DT, heightOf(p));
  p.grounded = result.grounded;
  updateCrouch(p, crouchHeld, map);

  // 3) Ground contact refills the air abilities.
  if (p.grounded) {
    p.coyoteTicks = MOVE.coyoteTicks;
    p.airJumpsLeft = MOVE.airJumps;
    p.wallRunLeft = MOVE.wallRunMaxTicks;
    p.wallRunning = false;
    p.wallNormalX = 0;
    p.wallNormalZ = 0;
  } else if (p.coyoteTicks > 0) {
    p.coyoteTicks--;
  }

  // 4) Standing on a jump pad throws the player into the air.
  applyJumpPads(p, map);
  return { jumped, dashed };
}
