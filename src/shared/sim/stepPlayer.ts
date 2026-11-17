/**
 * The PREDICTABLE part of the simulation: one tick of one player, depending only on that
 * player's own state and input (plus the static map).
 *
 * The server runs this for every player. The client runs the very same function to
 * predict its own player before the server answers. Keep it deterministic:
 * no Math.random(), no Date.now(), no state outside of PlayerState.
 */
import { actionSpeedFactor, stepAction } from '../combat/actions';
import type { InputCmd } from '../input';
import type { MapDef } from '../maps/mapTypes';
import type { GameMode } from '../match/gameModes';
import { stepMovement } from '../movement/stepMovement';
import { clearInputBuffer, updateInputBuffer } from './inputBuffer';
import type { PlayerState } from './playerState';
import { phaseAllowsAction, type MatchPhase } from './world';

/** Full simulation step for an active player. */
function stepActivePlayer(p: PlayerState, input: InputCmd, map: MapDef, mode: GameMode): void {
  updateInputBuffer(p, input);
  // Movement first: a dash started this tick already turns an attack into a dash attack.
  const moved = stepMovement(p, input, map, {
    speedFactor: actionSpeedFactor(p),
    canDash: p.action !== 'stunned',
    dashCooldownTicks: mode.dashCooldownTicks,
  });
  stepAction(p, mode, moved);
  p.prevButtons = input.buttons;
}

/** Frozen players (countdown, dead, round over) can only look around. */
function stepFrozenPlayer(p: PlayerState, input: InputCmd): void {
  p.yaw = input.yaw;
  p.pitch = input.pitch;
  p.prevButtons = input.buttons;
  clearInputBuffer(p);
}

/**
 * Advance one player by one tick. THE function shared by server simulation and
 * client prediction - if both call it with the same arguments they get the same result.
 */
export function stepPlayer(
  p: PlayerState,
  input: InputCmd,
  map: MapDef,
  phase: MatchPhase,
  mode: GameMode,
): void {
  if (p.alive && phaseAllowsAction(phase)) stepActivePlayer(p, input, map, mode);
  else stepFrozenPlayer(p, input);
}
