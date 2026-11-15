/**
 * Seeded pseudo random number generator (mulberry32).
 *
 * NEVER use Math.random() inside the simulation (src/shared/sim, movement, combat, match):
 * server and client would get different numbers and desync. If gameplay needs randomness,
 * store a seed in the world state and use this generator.
 * Bots use it so that a failing bot match can be replayed with the same seed.
 */
export type Rng = () => number;

/** Returns a function that yields numbers in [0, 1). Same seed => same sequence. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
