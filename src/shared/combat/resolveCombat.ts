/**
 * Player-vs-player combat resolution: who hits whom, and was it parried?
 *
 * Only the SERVER's result counts. The client cannot predict this (it does not know the
 * opponent's real state), it just receives the outcome in the next snapshot.
 *
 * Two steps per tick (lag compensation, see lagCompensation.ts):
 *   1. findContacts:  a swing that reaches its target becomes a "pending hit"
 *   2. decideHits:    a pending hit is decided once the target has seen it:
 *                     clash (the target swings back at the same moment), parry, block, or hit
 *
 * Parry and block need the defender to roughly face the attacker. A parry fills the
 * attacker's posture, a block the defender's own (combat/posture.ts); a full bar breaks.
 *
 * How much a hit hurts, invulnerability after a hit and the parry counter bonus are rules
 * of the game mode (match/gameModes.ts).
 */
import { forwardFromYaw } from '../math/vec3';
import { Button, isDown, type InputCmd } from '../input';
import type { GameMode } from '../match/gameModes';
import type { GameEvent } from '../sim/events';
import type { PlayerState } from '../sim/playerState';
import type { PendingHit, WorldState } from '../sim/world';
import { currentAttack, isAttackActive, isBlocking, isParryActive, setAction } from './actions';
import { stun } from './actionState';
import { addPosture } from './posture';
import { COMBAT } from './combatConfig';
import { isFacing, isInMeleeRange } from './hitDetection';
import { effectiveViewTick, positionAt } from './lagCompensation';
import { refundDashCharge } from '../movement/dash';
import { getWeapon } from './weapons';

type Inputs = Record<number, InputCmd | undefined>;

/** Step 1: every active swing that reaches a target (where the attacker saw it) connects. */
function findContacts(world: WorldState, inputs: Inputs): PendingHit[] {
  const contacts: PendingHit[] = [];
  for (const attacker of world.players) {
    if (!attacker.alive || attacker.attackConnected || !isAttackActive(attacker)) continue;
    const attackerInput = inputs[attacker.slot];
    const seenTick = effectiveViewTick(world, attackerInput?.viewTick);
    const aimAssist = attackerInput !== undefined && isDown(attackerInput, Button.AimAssist);
    for (const target of world.players) {
      // An invulnerable target is not hit; the swing may still land when that runs out.
      if (target === attacker || !target.alive || target.invulnerableTicks > 0) continue;
      const seenPos = positionAt(world, target.slot, seenTick) ?? target.pos;
      if (!isInMeleeRange(attacker, target, currentAttack(attacker), seenPos, aimAssist)) continue;
      contacts.push({
        attacker: attacker.slot,
        target: target.slot,
        tick: world.tick,
        kind: attacker.attackKind,
        counter: attacker.counterTicks > 0,
      });
    }
  }
  return contacts;
}

/** Unit vector from `from` to `to` on the ground plane (falls back to `from`'s view direction). */
function directionBetween(from: PlayerState, to: PlayerState): { x: number; z: number } {
  const dx = to.pos.x - from.pos.x;
  const dz = to.pos.z - from.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-6) return forwardFromYaw(from.yaw);
  return { x: dx / dist, z: dz / dist };
}

function applyHit(
  hit: PendingHit,
  attacker: PlayerState,
  target: PlayerState,
  mode: GameMode,
  events: GameEvent[],
): void {
  const attack = getWeapon(attacker.weaponId).attacks[hit.kind];
  const damage = mode.damage[hit.kind] + (hit.counter ? mode.parryCounterBonus : 0);
  target.hp = Math.max(0, target.hp - damage);
  if (target.hp > 0) target.invulnerableTicks = mode.invulnerableTicks;
  if (hit.counter) attacker.counterTicks = 0; // the bonus is used up
  refundDashCharge(attacker); // a hit gives a dash charge back
  // Push the target away from the attacker.
  const dir = directionBetween(attacker, target);
  target.vel.x += dir.x * attack.knockback;
  target.vel.z += dir.z * attack.knockback;
  target.vel.y = Math.max(target.vel.y, attack.knockback * COMBAT.knockbackLift);
  events.push({
    type: 'hit',
    attacker: attacker.slot,
    target: target.slot,
    kind: hit.kind,
    damage,
    counter: hit.counter,
    hpLeft: target.hp,
  });
}

/**
 * The attacker is stunned and pushed back; the defender may act again immediately and
 * (if the mode says so) its next hit within a short time does bonus damage.
 */
function applyParry(attacker: PlayerState, target: PlayerState, mode: GameMode, events: GameEvent[]): void {
  let broken = false;
  if (attacker.alive) {
    stun(attacker, COMBAT.parryStunTicks);
    broken = addPosture(attacker, COMBAT.parryPostureDamage); // a full bar stuns much longer
    pushAway(attacker, target, COMBAT.parryPushback);
  }
  setAction(target, 'idle');
  refundDashCharge(target); // a successful parry gives a dash charge back
  target.parryCooldown = 0;
  target.attackCooldown = 0;
  target.counterTicks = mode.parryCounterTicks;
  events.push({ type: 'parry', attacker: attacker.slot, defender: target.slot, broken });
}

/** Push `p` away from `from` with a small hop (so that ground friction does not eat the push). */
function pushAway(p: PlayerState, from: PlayerState, speed: number): void {
  const away = directionBetween(from, p);
  p.vel.x = away.x * speed;
  p.vel.z = away.z * speed;
  p.vel.y = Math.max(p.vel.y, COMBAT.parryLift);
  p.lungeTicks = 0;
}

/** Blocked: nobody is hurt, but the defender's posture fills; the attacker bounces off. */
function applyBlock(hit: PendingHit, attacker: PlayerState, target: PlayerState, events: GameEvent[]): void {
  const attack = getWeapon(attacker.weaponId).attacks[hit.kind];
  const broken = addPosture(target, attack.postureDamage);
  if (attacker.alive) pushAway(attacker, target, COMBAT.blockPushback);
  events.push({ type: 'block', attacker: attacker.slot, defender: target.slot, broken });
}

/**
 * True if the target of `hit` is swinging back at the attacker at (almost) the same
 * moment: its own blade reaches the attacker within COMBAT.clashWindowTicks of this hit.
 */
function isClash(world: WorldState, hit: PendingHit, attacker: PlayerState, target: PlayerState): boolean {
  if (!attacker.alive || target.action !== 'attack') return false;
  const swing = currentAttack(target);
  // The tick at which the target's blade became (or will become) dangerous.
  const targetStrikesAt = world.tick - (target.actionTicks - swing.startupTicks);
  if (Math.abs(targetStrikesAt - hit.tick) > COMBAT.clashWindowTicks) return false;
  return isInMeleeRange(target, attacker, swing);
}

/** Both blades bounce off: nobody is hurt, both are thrown back and must recover. */
function applyClash(a: PlayerState, b: PlayerState, events: GameEvent[]): void {
  const fromAtoB = directionBetween(a, b);
  for (const [p, sign] of [[a, -1], [b, 1]] as const) {
    setAction(p, 'idle');
    p.attackCooldown = COMBAT.clashCooldownTicks;
    p.dashTicks = 0;
    p.vel.x = fromAtoB.x * sign * COMBAT.clashPushback;
    p.vel.z = fromAtoB.z * sign * COMBAT.clashPushback;
    p.vel.y = Math.max(p.vel.y, COMBAT.clashLift);
  }
  events.push({ type: 'clash', a: a.slot, b: b.slot });
}

/**
 * Step 2: decide every pending hit whose target has seen it by now.
 * Returns the hits that are still undecided.
 */
function decideHits(world: WorldState, inputs: Inputs, mode: GameMode, events: GameEvent[]): PendingHit[] {
  const undecided: PendingHit[] = [];
  /** Players whose swing ended in a clash this tick: their own pending hits are void. */
  const clashed = new Set<number>();
  for (const hit of world.pendingHits) {
    const attacker = world.players.find((p) => p.slot === hit.attacker);
    const target = world.players.find((p) => p.slot === hit.target);
    if (!attacker || !target || !target.alive || clashed.has(hit.attacker)) continue;
    if (isClash(world, hit, attacker, target)) {
      applyClash(attacker, target, events);
      clashed.add(attacker.slot).add(target.slot);
      continue;
    }
    if (effectiveViewTick(world, inputs[target.slot]?.viewTick) < hit.tick) {
      undecided.push(hit); // the target has not seen this swing land yet - it may still parry
      continue;
    }
    const facing = isFacing(target, attacker);
    if (isParryActive(target) && facing) applyParry(attacker, target, mode, events);
    else if (isBlocking(target) && facing) applyBlock(hit, attacker, target, events);
    else applyHit(hit, attacker, target, mode, events);
  }
  // A clash also cancels hits that were decided to wait earlier in this loop.
  return undecided.filter((hit) => !clashed.has(hit.attacker));
}

/**
 * Resolve melee combat for this tick.
 * All contacts are collected first and decided afterwards, so the result does not depend
 * on the order of the players (two simultaneous hits both count).
 */
export function resolveCombat(world: WorldState, inputs: Inputs, mode: GameMode, events: GameEvent[]): void {
  for (const contact of findContacts(world, inputs)) {
    const attacker = world.players.find((p) => p.slot === contact.attacker);
    if (attacker) attacker.attackConnected = true; // one result per swing
    world.pendingHits.push(contact);
  }
  world.pendingHits = decideHits(world, inputs, mode, events);
}
