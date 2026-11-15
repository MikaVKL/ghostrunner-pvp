/**
 * Generic comparison of two plain-data states. Works for any JSON-like object, so new
 * fields in PlayerState are compared automatically (no list to keep up to date).
 * Used by: server (did combat change this player?), client (was my prediction right?).
 */

type Plain = Record<string, unknown>;

/**
 * Largest numeric difference between two values, searched recursively.
 * Returns Infinity if a non-numeric field differs (boolean, string, missing key).
 * Returns 0 if both are identical.
 */
export function stateDifference(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b);
  if (a === b) return 0;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return Infinity;
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return Infinity;
  let max = 0;
  for (const key of keysA) {
    const diff = stateDifference((a as Plain)[key], (b as Plain)[key]);
    if (diff > max) max = diff;
  }
  return max;
}

/**
 * Human readable list of differing fields, e.g. ["vel.y: 1.2 vs 1.3"].
 * Used in desync reports so you can see WHICH field went out of sync.
 */
export function listDifferences(a: unknown, b: unknown, epsilon = 0, path = ''): string[] {
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) > epsilon ? [`${path}: ${a} vs ${b}`] : [];
  }
  if (a === b) return [];
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return [`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`];
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: string[] = [];
  for (const key of keys) {
    const childPath = path ? `${path}.${key}` : key;
    out.push(...listDifferences((a as Plain)[key], (b as Plain)[key], epsilon, childPath));
  }
  return out;
}

/** Stable 32-bit hash (FNV-1a) of any plain-data state. Used by determinism tests. */
export function hashState(state: unknown): number {
  const text = JSON.stringify(state);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
