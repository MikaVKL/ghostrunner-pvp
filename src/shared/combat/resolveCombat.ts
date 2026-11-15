/**
 * Player-vs-player combat resolution: who hits whom, and was it parried?
 *
 * Only the SERVER's result counts. The client cannot predict this (it does not know the
 * opponent's real state), it just receives the outcome in the next snapshot.
 */
import { forwardFromYaw } from '../math/vec3';
import type { GameEvent } from '../sim/events';
import type { PlayerState } from '../sim/playerState';
import { isAttackActive, isParryActive, setAction } from './actions';
import { COMBAT } from './combatConfig';
import { isFacing, isInMeleeRange } from './hitDetection';
import { getWeapon, type WeaponDef } from './weapons';

interface Contact {
  attacker: PlayerState;
  target: PlayerState;
  weapon: WeaponDef;
  parried: boolean;
}

/** Find every swing that connects this tick. Does not modify anything. */
function findContacts(players: PlayerState[]): Contact[] {
  const contacts: Contact[] = [];
  for (const attacker of players) {
    if (!attacker.alive || attacker.attackConnected || !isAttackActive(attacker)) continue;
    const weapon = getWeapon(attacker.weaponId);
    for (const target of players) {
      if (target === attacker || !target.alive) continue;
      if (!isInMeleeRange(attacker, target, weapon)) continue;
      const parried = isParryActive(target) && isFacing(target, attacker);
      contacts.push({ attacker, target, weapon, parried });
    }
  }
  return contacts;
}

function applyHit(c: Contact, events: GameEvent[]): void {
  const { attacker, target, weapon } = c;
  target.hp = Math.max(0, target.hp - weapon.damage);
  // Push the target away from the attacker.
  let dx = target.pos.x - attacker.pos.x;
  let dz = target.pos.z - attacker.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-6) ({ x: dx, z: dz } = forwardFromYaw(attacker.yaw));
  else {
    dx /= dist;
    dz /= dist;
  }
  target.vel.x += dx * weapon.knockback;
  target.vel.z += dz * weapon.knockback;
  target.vel.y = Math.max(target.vel.y, weapon.knockback * COMBAT.knockbackLift);
  events.push({
    type: 'hit',
    attacker: attacker.slot,
    target: target.slot,
    damage: weapon.damage,
    hpLeft: target.hp,
  });
}

function applyParry(c: Contact, events: GameEvent[]): void {
  setAction(c.attacker, 'stunned');
  events.push({ type: 'parry', attacker: c.attacker.slot, defender: c.target.slot });
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
