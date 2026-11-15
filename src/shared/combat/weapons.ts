/**
 * Weapon definitions (pure data). To add a weapon, add an entry to WEAPONS.
 * See HOW_TO_EXTEND.md ("Neue Waffe").
 *
 * A swing has three phases, counted in ticks:
 *   startup  -> the swing is winding up, cannot hit yet (this is when the enemy can react)
 *   active   -> the blade can hit
 *   recovery -> the swing is over, the attacker cannot act yet
 */
import { secondsToTicks } from '../config';

export interface WeaponDef {
  id: string;
  name: string;
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

export const WEAPONS: Record<string, WeaponDef> = {
  sword: {
    id: 'sword',
    name: 'Sword',
    damage: 34,
    range: 2.6,
    arcDegrees: 100,
    startupTicks: secondsToTicks(0.13),
    activeTicks: secondsToTicks(0.08),
    recoveryTicks: secondsToTicks(0.27),
    knockback: 6,
  },
};

export const DEFAULT_WEAPON_ID = 'sword';

export function getWeapon(id: string): WeaponDef {
  return WEAPONS[id] ?? WEAPONS[DEFAULT_WEAPON_ID];
}

export function attackTotalTicks(weapon: WeaponDef): number {
  return weapon.startupTicks + weapon.activeTicks + weapon.recoveryTicks;
}
