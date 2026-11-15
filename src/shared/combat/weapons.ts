/**
 * Weapon definitions (pure data). To add a weapon, add an entry to WEAPONS.
 * See HOW_TO_EXTEND.md ("Neue Waffe").
 *
 * Every weapon has one attack profile per attack kind:
 *   light -> the normal swing (attack button)
 *   dash  -> the swing started during (or right after) a dash: longer reach, faster
 *            startup, but a long recovery (easy to punish when it misses or is parried)
 *
 * A swing has three phases, counted in ticks:
 *   startup  -> the swing is winding up, cannot hit yet (this is when the enemy can parry)
 *   active   -> the blade can hit
 *   recovery -> the swing is over, the attacker cannot act yet
 */
import { secondsToTicks } from '../config';

export type AttackKind = 'light' | 'dash';

export interface AttackProfile {
  /** HP removed by a hit. MAX_HP is 100, so 100 = one-hit kill. */
  damage: number;
  /** Reach in meters, measured from the attacker's center to the target's surface. */
  range: number;
  /** Full width of the hit cone in front of the attacker, in degrees. */
  arcDegrees: number;
  startupTicks: number;
  activeTicks: number;
  recoveryTicks: number;
  /** Horizontal speed (m/s) added to a target that gets hit. */
  knockback: number;
}

export interface WeaponDef {
  id: string;
  /** Display name (German, shown in the UI). */
  name: string;
  attacks: Record<AttackKind, AttackProfile>;
  /** After a swing has ended, the next swing may start only after this many ticks. */
  cooldownTicks: number;
}

export const WEAPONS: Record<string, WeaponDef> = {
  sword: {
    id: 'sword',
    name: 'Katana',
    attacks: {
      light: {
        damage: 100,
        range: 2.4,
        arcDegrees: 90,
        startupTicks: secondsToTicks(0.2),
        activeTicks: secondsToTicks(0.1),
        recoveryTicks: secondsToTicks(0.3),
        knockback: 6,
      },
      dash: {
        damage: 100,
        range: 3.2,
        arcDegrees: 60,
        startupTicks: secondsToTicks(0.1),
        activeTicks: secondsToTicks(0.1),
        recoveryTicks: secondsToTicks(0.45),
        knockback: 9,
      },
    },
    cooldownTicks: secondsToTicks(0.25),
  },
};

export const DEFAULT_WEAPON_ID = 'sword';

export function getWeapon(id: string): WeaponDef {
  return WEAPONS[id] ?? WEAPONS[DEFAULT_WEAPON_ID];
}

export function attackTotalTicks(attack: AttackProfile): number {
  return attack.startupTicks + attack.activeTicks + attack.recoveryTicks;
}
