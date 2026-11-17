/**
 * How bright a blade glows and when it leaves a trail, read from the fighter's state.
 * Pure functions (unit tested), used for the first-person sword and the opponent's sword.
 *
 * Clearer wind-up ("telegraph" setting): during the startup of a swing the blade gets
 * brighter and brighter until it strikes - with bloom on it visibly flares up. That is
 * the moment to parry or dodge.
 */
import { currentAttack } from '../../shared/combat/actions';
import type { PlayerState } from '../../shared/sim/playerState';

/** Emissive intensity of a blade at rest. */
export const BLADE_REST_GLOW = 0.9;
const BLADE_WINDUP_GLOW = 3.2;
const BLADE_STRIKE_GLOW = 2.2;

/** Emissive intensity of the blade for this frame. */
export function bladeGlow(p: PlayerState, telegraph: boolean): number {
  if (!p.alive || p.action !== 'attack') return BLADE_REST_GLOW;
  const attack = currentAttack(p);
  const sinceActive = p.actionTicks - attack.startupTicks;
  if (sinceActive < 0) {
    if (!telegraph) return BLADE_REST_GLOW;
    const t = p.actionTicks / Math.max(1, attack.startupTicks);
    return BLADE_REST_GLOW + (BLADE_WINDUP_GLOW - BLADE_REST_GLOW) * t * t;
  }
  if (sinceActive < attack.activeTicks) return BLADE_STRIKE_GLOW;
  return BLADE_REST_GLOW;
}

/** True while the blade moves fast enough to leave a trail: shortly before, during and after the hit phase. */
export function trailEmitting(p: PlayerState): boolean {
  if (!p.alive || p.action !== 'attack') return false;
  const attack = currentAttack(p);
  const sinceActive = p.actionTicks - attack.startupTicks;
  return sinceActive >= -2 && sinceActive < attack.activeTicks + 3;
}
