import { describe, expect, it } from 'vitest';
import { TICK_DT } from '../../src/shared/config';
import { boxFromBounds } from '../../src/shared/maps/mapTypes';
import { vec3 } from '../../src/shared/math/vec3';
import {
  moveAndCollide,
  PLAYER_HALF_WIDTH,
  PLAYER_HEIGHT,
  playerOverlapsBox,
} from '../../src/shared/physics/collision';

const floor = boxFromBounds(-10, 10, -1, 0, -10, 10);
const wall = boxFromBounds(3, 4, 0, 5, -10, 10);
const ceiling = boxFromBounds(-10, 10, 3, 4, -10, 10);

describe('moveAndCollide', () => {
  it('lands on the floor and reports grounded', () => {
    const pos = vec3(0, 0.05, 0);
    const vel = vec3(0, -6, 0);
    const result = moveAndCollide(pos, vel, [floor], TICK_DT);
    expect(result.grounded).toBe(true);
    expect(pos.y).toBe(0);
    expect(vel.y).toBe(0);
  });

  it('is not grounded while in the air', () => {
    const pos = vec3(0, 5, 0);
    const result = moveAndCollide(pos, vec3(0, -1, 0), [floor], TICK_DT);
    expect(result.grounded).toBe(false);
  });

  it('stops at a wall and keeps the sideways velocity', () => {
    const pos = vec3(2.55, 0, 0);
    const vel = vec3(10, 0, 4);
    moveAndCollide(pos, vel, [floor, wall], TICK_DT);
    expect(pos.x).toBeCloseTo(3 - PLAYER_HALF_WIDTH);
    expect(vel.x).toBe(0);
    expect(vel.z).toBe(4);
  });

  it('touching a wall does not block sliding along it (no sticky walls)', () => {
    const pos = vec3(3 - PLAYER_HALF_WIDTH, 0, 0);
    const vel = vec3(0, 0, 5);
    for (let i = 0; i < 30; i++) moveAndCollide(pos, vel, [floor, wall], TICK_DT);
    expect(pos.z).toBeCloseTo(2.5);
    expect(pos.x).toBeCloseTo(3 - PLAYER_HALF_WIDTH);
  });

  it('never tunnels through a box, even at extreme speed', () => {
    const pos = vec3(0, 0, 0);
    const vel = vec3(500, 0, 0);
    moveAndCollide(pos, vel, [floor, wall], TICK_DT);
    expect(pos.x).toBeLessThanOrEqual(3 - PLAYER_HALF_WIDTH + 1e-9);

    const falling = vec3(0, 3, 0);
    moveAndCollide(falling, vec3(0, -900, 0), [floor], TICK_DT);
    expect(falling.y).toBe(0);
  });

  it('bumps the head on a ceiling', () => {
    const pos = vec3(0, 3 - PLAYER_HEIGHT - 0.01, 0);
    const vel = vec3(0, 8, 0);
    const result = moveAndCollide(pos, vel, [floor, ceiling], TICK_DT);
    expect(pos.y).toBeCloseTo(3 - PLAYER_HEIGHT);
    expect(vel.y).toBe(0);
    expect(result.grounded).toBe(false);
  });

  it('standing exactly on a box does not count as overlapping it', () => {
    expect(playerOverlapsBox(vec3(0, 0, 0), floor)).toBe(false);
    expect(playerOverlapsBox(vec3(0, -0.01, 0), floor)).toBe(true);
  });
});
