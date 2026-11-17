/**
 * Look-and-feel effects (display only): settings, hitstop, instant contact spark, blade
 * glow during the wind-up, sword trail timing and speed lines.
 */
import { describe, expect, it } from 'vitest';
import { ContactWatcher } from '../../src/client/app/contactWatcher';
import { FrameRateGuard } from '../../src/client/app/frameRateGuard';
import { Hitstop } from '../../src/client/app/hitstop';
import { DEFAULT_SETTINGS, FX_KEYS, parseSettings } from '../../src/client/app/settings';
import { BLADE_REST_GLOW, bladeGlow, trailEmitting } from '../../src/client/render/bladeGlow';
import { speedLineIntensity } from '../../src/client/render/speedLines';
import { WEAPONS } from '../../src/shared/combat/weapons';
import { MOVE } from '../../src/shared/movement/movementConfig';
import { standingPlayer } from '../helpers';

const light = WEAPONS.sword.attacks.light;

function swinging(ticks: number, x = 0, z = 0) {
  const p = standingPlayer(x, z);
  p.action = 'attack';
  p.attackKind = 'light';
  p.actionTicks = ticks;
  return p;
}

describe('look-and-feel settings', () => {
  it('every effect is on by default and can be switched off', () => {
    for (const key of FX_KEYS) expect(DEFAULT_SETTINGS[key]).toBe(true);
    const off = parseSettings(Object.fromEntries(FX_KEYS.map((key) => [key, false])));
    for (const key of FX_KEYS) expect(off[key]).toBe(false);
  });

  it('old or broken stored settings fall back to the defaults', () => {
    expect(parseSettings({ volume: 0.2 })).toEqual({ ...DEFAULT_SETTINGS, volume: 0.2 });
    expect(parseSettings({ bloom: 'yes', windupCue: 'maybe' })).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
});

describe('hitstop', () => {
  it('freezes the picture for the given time, then lets it move again', () => {
    const stop = new Hitstop();
    expect(stop.advance(16)).toBe(16);
    stop.trigger(50);
    expect(stop.frozen).toBe(true);
    expect(stop.advance(16)).toBe(0);
    expect(stop.advance(16)).toBe(0);
    expect(stop.advance(16)).toBe(0);
    expect(stop.advance(16)).toBe(14); // 2 ms of the freeze were left
    expect(stop.frozen).toBe(false);
  });

  it('does not freeze twice within one exchange, and never when switched off', () => {
    const stop = new Hitstop();
    stop.trigger(50);
    stop.advance(60);
    stop.trigger(50); // e.g. the server's hit event right after our own contact spark
    expect(stop.frozen).toBe(false);
    stop.advance(300);
    stop.trigger(50);
    expect(stop.frozen).toBe(true);

    const off = new Hitstop();
    off.enabled = false;
    off.trigger(50);
    expect(off.advance(16)).toBe(16);
  });
});

describe('instant contact spark', () => {
  it('fires once per swing, only in the hit phase, only when the blade reaches the shown enemy', () => {
    const watcher = new ContactWatcher();
    const enemy = standingPlayer(0, -2); // 2 m in front (yaw 0 looks toward -Z)
    expect(watcher.check(swinging(1), [enemy])).toBeNull(); // still winding up
    expect(watcher.check(swinging(light.startupTicks), [enemy])).toBe(enemy);
    expect(watcher.check(swinging(light.startupTicks + 1), [enemy])).toBeNull(); // already shown
    // The next swing may spark again.
    expect(watcher.check(swinging(0), [enemy])).toBeNull();
    expect(watcher.check(swinging(light.startupTicks), [enemy])).toBe(enemy);
  });

  it('no spark for an enemy out of reach, behind us, dead or invulnerable', () => {
    const at = light.startupTicks;
    expect(new ContactWatcher().check(swinging(at), [standingPlayer(0, -6)])).toBeNull();
    expect(new ContactWatcher().check(swinging(at), [standingPlayer(0, 2)])).toBeNull();
    const dead = standingPlayer(0, -2);
    dead.alive = false;
    expect(new ContactWatcher().check(swinging(at), [dead])).toBeNull();
    const shielded = standingPlayer(0, -2);
    shielded.invulnerableTicks = 10;
    expect(new ContactWatcher().check(swinging(at), [shielded])).toBeNull();
  });
});

describe('blade glow and trail', () => {
  it('the blade flares up during the wind-up only with the telegraph setting', () => {
    expect(bladeGlow(standingPlayer(), true)).toBe(BLADE_REST_GLOW);
    const early = bladeGlow(swinging(2), true);
    const late = bladeGlow(swinging(light.startupTicks - 1), true);
    expect(late).toBeGreaterThan(early);
    expect(early).toBeGreaterThanOrEqual(BLADE_REST_GLOW);
    expect(bladeGlow(swinging(light.startupTicks - 1), false)).toBe(BLADE_REST_GLOW);
  });

  it('the trail is drawn around the hit phase, not during the whole wind-up or recovery', () => {
    expect(trailEmitting(swinging(0))).toBe(false);
    expect(trailEmitting(swinging(light.startupTicks))).toBe(true);
    expect(trailEmitting(swinging(light.startupTicks + light.activeTicks + light.recoveryTicks - 1))).toBe(false);
  });
});

describe('speed lines', () => {
  it('appear above run speed and are strongest while dashing', () => {
    const p = standingPlayer();
    expect(speedLineIntensity(p)).toBe(0);
    p.vel.x = MOVE.runSpeed;
    expect(speedLineIntensity(p)).toBe(0);
    p.vel.x = MOVE.dashSpeed;
    expect(speedLineIntensity(p)).toBe(1);
    p.vel.x = 0;
    p.dashTicks = 3;
    expect(speedLineIntensity(p)).toBe(1);
    expect(speedLineIntensity(null)).toBe(0);
  });
});

describe('frame rate guard', () => {
  it('reports once when the game runs below 30 frames per second for 2 seconds', () => {
    const guard = new FrameRateGuard();
    let reports = 0;
    for (let i = 0; i < 200; i++) if (guard.observe(1000 / 60)) reports++;
    expect(reports).toBe(0);
    for (let i = 0; i < 100; i++) if (guard.observe(1000 / 15)) reports++;
    expect(reports).toBe(1);
    guard.reset();
    for (let i = 0; i < 100; i++) if (guard.observe(1000 / 15)) reports++;
    expect(reports).toBe(2);
  });
});
