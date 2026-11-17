/**
 * Wind-up cue (red ring + tone while the enemy's swing winds up): when it is on, and
 * what the ring shows. Display only - the simulation does not know about it.
 */
import { describe, expect, it } from 'vitest';
import { isWindupCueSetting, windupCueEnabled } from '../../src/client/app/settings';
import { WindupRing, windupProgress } from '../../src/client/render/windupRing';
import { WEAPONS } from '../../src/shared/combat/weapons';
import { DUEL } from '../../src/shared/match/gameModes';
import { standingPlayer } from '../helpers';

const light = WEAPONS.sword.attacks.light;

function windingUp(ticks: number) {
  const p = standingPlayer();
  p.action = 'attack';
  p.attackKind = 'light';
  p.actionTicks = ticks;
  return p;
}

describe('wind-up cue setting', () => {
  it('"Nach Modus" follows the mode: off in the duel, on where the mode wants it', () => {
    expect(windupCueEnabled('auto', DUEL)).toBe(false);
    expect(windupCueEnabled('auto', { ...DUEL, windupCueByDefault: true })).toBe(true);
    expect(windupCueEnabled('auto', null)).toBe(false);
  });

  it('"An" and "Aus" ignore the mode', () => {
    expect(windupCueEnabled('on', DUEL)).toBe(true);
    expect(windupCueEnabled('off', { ...DUEL, windupCueByDefault: true })).toBe(false);
  });

  it('only known values are accepted from storage', () => {
    expect(['auto', 'on', 'off'].every(isWindupCueSetting)).toBe(true);
    expect(isWindupCueSetting('yes')).toBe(false);
    expect(isWindupCueSetting(true)).toBe(false);
  });
});

describe('wind-up progress', () => {
  it('runs from 0 to almost 1 during the startup of a swing', () => {
    expect(windupProgress(windingUp(0))).toBe(0);
    const half = windupProgress(windingUp(light.startupTicks / 2))!;
    expect(half).toBeCloseTo(0.5);
    expect(windupProgress(windingUp(light.startupTicks - 1))!).toBeLessThan(1);
  });

  it('is off once the blade can hit, when not attacking and when dead', () => {
    expect(windupProgress(windingUp(light.startupTicks))).toBeNull();
    expect(windupProgress(standingPlayer())).toBeNull();
    const dead = windingUp(2);
    dead.alive = false;
    expect(windupProgress(dead)).toBeNull();
  });
});

describe('wind-up ring', () => {
  it('is visible only while enabled and winding up, and closes in towards the hit', () => {
    const ring = new WindupRing();
    ring.update(windingUp(1), false);
    expect(ring.mesh.visible).toBe(false);
    ring.update(windingUp(1), true);
    expect(ring.mesh.visible).toBe(true);
    const early = ring.mesh.scale.x;
    ring.update(windingUp(light.startupTicks - 1), true);
    expect(ring.mesh.scale.x).toBeLessThan(early);
    ring.update(standingPlayer(), true);
    expect(ring.mesh.visible).toBe(false);
  });
});
