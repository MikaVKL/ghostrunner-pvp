/**
 * Player-vs-player combat resolution: who hits whom, and was it parried?
 *
 * Only the SERVER's result counts. The client cannot predict this (it does not know the
 * opponent's real state), it just receives the outcome in the next snapshot.
 */
import { forwardFromYaw } from '../math/vec3';
import type { GameEvent } from '../sim/events';
import type { PlayerState } from '../sim/playerState';
import { currentAttack, isAttackActive, isParryActive, setAction } from './actions';
import { COMBAT } from './combatConfig';
import { isFacing, isInMeleeRange } from './hitDetection';
import type { AttackProfile } from './weapons';

interface Contact {
  attacker: PlayerState;
  target: PlayerState;
  attack: AttackProfile;
  parried: boolean;
}

/** Find every swing that connects this tick. Does not modify anything. */
function findContacts(players: PlayerState[]): Contact[] {
  const contacts: Contact[] = [];
  for (const attacker of players) {
    if (!attacker.alive || attacker.attackConnected || !isAttackActive(attacker)) continue;
    const attack = currentAttack(attacker);
    for (const target of players) {
      if (target === attacker || !target.alive) continue;
      if (!isInMeleeRange(attacker, target, attack)) continue;
      const parried = isParryActive(target) && isFacing(target, attacker);
      contacts.push({ attacker, target, attack, parried });
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

function applyHit(c: Contact, events: GameEvent[]): void {
  const { attacker, target, attack } = c;
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
    kind: attacker.attackKind,
    damage: attack.damage,
    hpLeft: target.hp,
  });
}

/** The attacker is stunned and pushed back; the defender may act again immediately. */
function applyParry(c: Contact, events: GameEvent[]): void {
  const { attacker, target } = c;
  setAction(attacker, 'stunned');
  attacker.dashTicks = 0;
  const away = directionBetween(target, attacker);
  attacker.vel.x = away.x * COMBAT.parryPushback;
  attacker.vel.z = away.z * COMBAT.parryPushback;
  setAction(target, 'idle');
  target.parryCooldown = 0;
  target.attackCooldown = 0;
  events.push({ type: 'parry', attacker: attacker.slot, defender: target.slot });
}

/**
 * Resolve all melee contacts of this tick.
 * All contacts are collected first and applied afterwards, so the result does not depend
 * on the order of the players (two simultaneous hits both count).
 */
export function resolveCombat(players: PlayerState[], events: GameEvent[]): void {
  const contacts = findContacts(players);
  for (const contact of contacts) {
    if (contact.parried) applyParry(contact, events);
    else applyHit(contact, events);
    contact.attacker.attackConnected = true;
  }
}
