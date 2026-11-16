/**
 * Player-vs-player combat resolution: who hits whom, and was it parried?
 *
 * Only the SERVER's result counts. The client cannot predict this (it does not know the
 * opponent's real state), it just receives the outcome in the next snapshot.
 *
 * Two steps per tick (lag compensation, see lagCompensation.ts):
 *   1. findContacts:  a swing that reaches its target becomes a "pending hit"
 *   2. decideHits:    a pending hit is decided once the target has seen it: parry or hit
 */
import { forwardFromYaw } from '../math/vec3';
import type { InputCmd } from '../input';
import type { GameEvent } from '../sim/events';
import type { PlayerState } from '../sim/playerState';
import type { PendingHit, WorldState } from '../sim/world';
import { currentAttack, isAttackActive, isParryActive, setAction } from './actions';
import { COMBAT } from './combatConfig';
import { isFacing, isInMeleeRange } from './hitDetection';
import { effectiveViewTick, positionAt } from './lagCompensation';
import { getWeapon } from './weapons';

type Inputs = Record<number, InputCmd | undefined>;

/** Step 1: every active swing that reaches a target (where the attacker saw it) connects. */
function findContacts(world: WorldState, inputs: Inputs): PendingHit[] {
  const contacts: PendingHit[] = [];
  for (const attacker of world.players) {
    if (!attacker.alive || attacker.attackConnected || !isAttackActive(attacker)) continue;
    const seenTick = effectiveViewTick(world, inputs[attacker.slot]?.viewTick);
    for (const target of world.players) {
      if (target === attacker || !target.alive) continue;
      const seenPos = positionAt(world, target.slot, seenTick) ?? target.pos;
      if (!isInMeleeRange(attacker, target, currentAttack(attacker), seenPos)) continue;
      contacts.push({ attacker: attacker.slot, target: target.slot, tick: world.tick, kind: attacker.attackKind });
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

function applyHit(hit: PendingHit, attacker: PlayerState, target: PlayerState, events: GameEvent[]): void {
  const attack = getWeapon(attacker.weaponId).attacks[hit.kind];
  target.hp = Math.max(0, target.hp - attack.damage);
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
    damage: attack.damage,
    hpLeft: target.hp,
  });
}

/** The attacker is stunned and pushed back; the defender may act again immediately. */
function applyParry(attacker: PlayerState, target: PlayerState, events: GameEvent[]): void {
  if (attacker.alive) {
    setAction(attacker, 'stunned');
    attacker.dashTicks = 0;
    const away = directionBetween(target, attacker);
    attacker.vel.x = away.x * COMBAT.parryPushback;
    attacker.vel.z = away.z * COMBAT.parryPushback;
  }
  setAction(target, 'idle');
  target.parryCooldown = 0;
  target.attackCooldown = 0;
  events.push({ type: 'parry', attacker: attacker.slot, defender: target.slot });
}

/**
 * Step 2: decide every pending hit whose target has seen it by now.
 * Returns the hits that are still undecided.
 */
function decideHits(world: WorldState, inputs: Inputs, events: GameEvent[]): PendingHit[] {
  const undecided: PendingHit[] = [];
  for (const hit of world.pendingHits) {
    const attacker = world.players.find((p) => p.slot === hit.attacker);
    const target = world.players.find((p) => p.slot === hit.target);
    if (!attacker || !target || !target.alive) continue;
    if (effectiveViewTick(world, inputs[target.slot]?.viewTick) < hit.tick) {
      undecided.push(hit); // the target has not seen this swing land yet - it may still parry
      continue;
    }
    if (isParryActive(target) && isFacing(target, attacker)) applyParry(attacker, target, events);
    else applyHit(hit, attacker, target, events);
  }
  return undecided;
}

/**
 * Resolve melee combat for this tick.
 * All contacts are collected first and decided afterwards, so the result does not depend
 * on the order of the players (two simultaneous hits both count).
 */
export function resolveCombat(world: WorldState, inputs: Inputs, events: GameEvent[]): void {
  for (const contact of findContacts(world, inputs)) {
    const attacker = world.players.find((p) => p.slot === contact.attacker);
    if (attacker) attacker.attackConnected = true; // one result per swing
    world.pendingHits.push(contact);
  }
  world.pendingHits = decideHits(world, inputs, events);
}
