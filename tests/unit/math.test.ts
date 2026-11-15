import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/shared/math/rng';
import { angleDifference, clamp, lerpAngle, moveToward, wrapAngle } from '../../src/shared/math/scalar';
import { forwardFromYaw, rightFromYaw, yawToward } from '../../src/shared/math/vec3';

describe('scalar helpers', () => {
  it('clamp limits a value to a range', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-5, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });

  it('moveToward never overshoots', () => {
    expect(moveToward(0, 10, 3)).toBe(3);
    expect(moveToward(9, 10, 3)).toBe(10);
    expect(moveToward(0, -10, 3)).toBe(-3);
  });

  it('wrapAngle keeps angles in [-PI, PI)', () => {
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(-Math.PI);
    expect(wrapAngle(0.5)).toBeCloseTo(0.5);
    expect(wrapAngle(-Math.PI * 2.5)).toBeCloseTo(-Math.PI / 2);
  });

  it('angleDifference and lerpAngle take the short way around', () => {
    expect(angleDifference(3, -3)).toBeCloseTo(Math.PI * 2 - 6);
    expect(wrapAngle(lerpAngle(3, -3, 0.5))).toBeCloseTo(-Math.PI, 1);
  });
});

describe('direction helpers', () => {
  it('yaw 0 looks along -Z with +X to the right', () => {
    expect(forwardFromYaw(0).z).toBeCloseTo(-1);
    expect(rightFromYaw(0).x).toBeCloseTo(1);
  });

  it('yawToward is the inverse of forwardFromYaw', () => {
    const yaw = yawToward({ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 });
    expect(forwardFromYaw(yaw).x).toBeCloseTo(1);
    expect(forwardFromYaw(yaw).z).toBeCloseTo(0);
  });
});

describe('seeded rng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 20; i++) expect(a()).toBe(b());
  });

  it('produces numbers in [0, 1) and differs between seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    let same = 0;
    for (let i = 0; i < 100; i++) {
      const value = a();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      if (value === b()) same++;
    }
    expect(same).toBeLessThan(5);
  });
});
