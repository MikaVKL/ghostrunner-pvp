/**
 * One tick of player movement. This is the single entry point for all movement code.
 * It runs on the server (authoritative) AND on the client (prediction) with identical results.
 */
import { TICK_DT } from '../config';
import { Button, isDown, wasPressed, type InputCmd } from '../input';
import type { MapDef } from '../maps/mapTypes';
import { moveAndCollide } from '../physics/collision';
import type { PlayerState } from '../sim/playerState';
import { stepDash, tryStartDash } from './dash';
import { applyJumpPads } from './jumpPad';
import { stepLocomotion, wishDirection } from './locomotion';
import { MOVE } from './movementConfig';
import { stepWallRun, updateWallRun } from './wallRun';

export interface MovementModifiers {
  /** Multiplier on run speed (e.g. < 1 while stunned). */
  speedFactor: number;
  /** False while the player may not dash (e.g. stunned). */
  canDash: boolean;
  /** Dash cooldown of the game mode (GameMode.dashCooldownTicks). */
  dashCooldownTicks: number;
}

export function stepMovement(
  p: PlayerState,
  input: InputCmd,
  map: MapDef,
  mods: MovementModifiers,
): void {
  p.yaw = input.yaw;
  p.pitch = input.pitch;
  if (p.dashCooldown > 0) p.dashCooldown--;
  if (p.wallCooldown > 0) p.wallCooldown--;

  const wish = wishDirection(input);
  const jumpPressed = wasPressed(input, p.prevButtons, Button.Jump);

  // 1) Decide the velocity for this tick (exactly one of: dash, wall-run, normal).
  tryStartDash(p, input, wish, mods);
  if (p.dashTicks > 0) {
    stepDash(p);
  } else {
    updateWallRun(p, input, map);
    if (p.wallRunning) stepWallRun(p, jumpPressed);
    else stepLocomotion(p, wish, jumpPressed, mods.speedFactor, isDown(input, Button.Walk));
  }

  // 2) Apply the velocity and collide with the map.
  const result = moveAndCollide(p.pos, p.vel, map.boxes, TICK_DT);
  p.grounded = result.grounded;

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
}
