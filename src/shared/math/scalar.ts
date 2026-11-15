/** Small number helpers. Pure functions only. */

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Move `current` toward `target` by at most `maxDelta` (never overshoots). */
export function moveToward(current: number, target: number, maxDelta: number): number {
  const diff = target - current;
  if (Math.abs(diff) <= maxDelta) return target;
  return current + Math.sign(diff) * maxDelta;
}

/** Wrap an angle in radians into the range [-PI, PI). */
export function wrapAngle(angle: number): number {
  const twoPi = Math.PI * 2;
  return angle - twoPi * Math.floor((angle + Math.PI) / twoPi);
}

/** Shortest signed difference from angle `a` to angle `b` (radians). */
export function angleDifference(a: number, b: number): number {
  return wrapAngle(b - a);
}

/** Interpolate between two angles along the shortest arc. */
export function lerpAngle(a: number, b: number, t: number): number {
  return a + angleDifference(a, b) * t;
}
