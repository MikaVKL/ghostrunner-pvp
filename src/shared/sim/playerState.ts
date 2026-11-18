/**
 * The complete state of one player.
 *
 * RULES (important for netcode, see CLAUDE.md):
 * - Everything that influences the simulation MUST live in this object. No hidden
 *   variables elsewhere, otherwise client prediction and the server drift apart.
 * - Only plain JSON data (numbers, booleans, strings, nested plain objects). The whole
 *   object is sent over the network as-is, so new fields are synchronized automatically.
 * - Durations are counted in ticks (integers), not seconds.
 */
import { DEFAULT_WEAPON_ID, type AttackKind } from '../combat/weapons';
import { cloneVec3, type Vec3 } from '../math/vec3';
import type { SpawnPoint } from '../maps/mapTypes';
import { DUEL } from '../match/gameModes';
import { MOVE } from '../movement/movementConfig';

/** What the player is currently doing in combat. See src/shared/combat/actions.ts. */
export type ActionState = 'idle' | 'attack' | 'guard' | 'stunned';

export interface PlayerState {
  /** Seat in the room: 0 or 1. Also selects the spawn point. */
  slot: number;
  alive: boolean;
  /** Lives left in this round (starts at GameMode.lives, a hit removes GameMode.damage). */
  hp: number;

  /** Feet position (bottom center of the collision box). */
  pos: Vec3;
  vel: Vec3;
  yaw: number;
  pitch: number;

  // --- movement ---
  grounded: boolean;
  /** Ticks left in which a jump is still allowed after walking off a ledge. */
  coyoteTicks: number;
  /** Extra jumps left while in the air. Refills on the ground, on a wall and on a jump pad. */
  airJumpsLeft: number;
  /** Ticks left in the current dash (0 = not dashing). */
  dashTicks: number;
  /** Ticks until the next dash is allowed (short gap between two dashes). */
  dashCooldown: number;
  /** Dash charges left (0..MOVE.dashMaxCharges), see movement/dash.ts. */
  dashCharges: number;
  /** Ticks until the next empty charge is refilled (0 = all full). */
  dashRecharge: number;
  /** True after a dash in the air; reset by touching the ground or a wall. */
  airDashUsed: boolean;
  dashDirX: number;
  dashDirZ: number;
  wallRunning: boolean;
  /** Wall-run budget in ticks. Refills when touching the ground. */
  wallRunLeft: number;
  /** Ticks until the player may attach to a wall again. */
  wallCooldown: number;
  /** Normal of the wall being run on (points away from the wall). 0/0 if none. */
  wallNormalX: number;
  wallNormalZ: number;
  /** Low body (crouching or sliding): shorter collision box, see CROUCH_HEIGHT. */
  crouching: boolean;
  /** Ticks left in the current slide (0 = not sliding). */
  slideTicks: number;
  /** Ticks until the next slide may start. */
  slideCooldown: number;

  // --- combat ---
  weaponId: string;
  action: ActionState;
  /** Ticks since the current action started. */
  actionTicks: number;
  /** True once the current swing has hit or been parried (one result per swing). */
  attackConnected: boolean;
  /** Which attack profile the current/last swing uses (normal or dash attack). */
  attackKind: AttackKind;
  /** Ticks until the next swing may start. */
  attackCooldown: number;
  /** Ticks left in which the swing pushes the attacker forward (AttackProfile.lungeSpeed). */
  lungeTicks: number;
  /** Ticks until the next parry window is ready (a guard started earlier only blocks). */
  parryCooldown: number;
  /** True if the current guard started with a parry window (see combat/guard.ts). */
  guardParry: boolean;
  /** Length of the current stun in ticks (parried: short, posture broken: long). */
  stunTicks: number;
  /** Posture ("Haltung") 0..COMBAT.postureMax; full = broken (see combat/posture.ts). */
  posture: number;
  /** Ticks until the posture starts to drain again. */
  postureRegenDelay: number;
  /** Ticks left in which hits do nothing (after being hit, see GameMode.invulnerableTicks). */
  invulnerableTicks: number;
  /** Ticks left in which the next own hit does bonus damage (after a successful parry). */
  counterTicks: number;

  /** Input buffer: ticks left in which a recent press is still carried out (0 = none). */
  bufferAttack: number;
  bufferParry: number;
  bufferDash: number;
  bufferJump: number;

  /** Buttons held in the previous tick. Needed to detect "just pressed". */
  prevButtons: number;
}

export function createPlayer(
  slot: number,
  spawn: SpawnPoint,
  weaponId = DEFAULT_WEAPON_ID,
  lives = DUEL.lives,
): PlayerState {
  return {
    slot,
    alive: true,
    hp: lives,
    pos: cloneVec3(spawn.pos),
    vel: { x: 0, y: 0, z: 0 },
    yaw: spawn.yaw,
    pitch: 0,
    grounded: false,
    coyoteTicks: 0,
    airJumpsLeft: 0,
    dashTicks: 0,
    dashCooldown: 0,
    dashCharges: MOVE.dashMaxCharges,
    dashRecharge: 0,
    airDashUsed: false,
    dashDirX: 0,
    dashDirZ: 0,
    wallRunning: false,
    wallRunLeft: 0,
    wallCooldown: 0,
    wallNormalX: 0,
    wallNormalZ: 0,
    crouching: false,
    slideTicks: 0,
    slideCooldown: 0,
    weaponId,
    action: 'idle',
    actionTicks: 0,
    attackConnected: false,
    attackKind: 'light',
    attackCooldown: 0,
    lungeTicks: 0,
    parryCooldown: 0,
    guardParry: false,
    stunTicks: 0,
    posture: 0,
    postureRegenDelay: 0,
    invulnerableTicks: 0,
    counterTicks: 0,
    bufferAttack: 0,
    bufferParry: 0,
    bufferDash: 0,
    bufferJump: 0,
    prevButtons: 0,
  };
}

/** Deep copy. Must copy every nested object (currently pos and vel). */
export function clonePlayer(p: PlayerState): PlayerState {
  return { ...p, pos: cloneVec3(p.pos), vel: cloneVec3(p.vel) };
}

/** Overwrite `target` in place with a fresh spawn state (keeps the object identity). */
export function resetPlayer(target: PlayerState, spawn: SpawnPoint, lives = DUEL.lives): void {
  Object.assign(target, createPlayer(target.slot, spawn, target.weaponId, lives));
}
