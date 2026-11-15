/**
 * Map registry. To add a map: create a file next to arena.ts and register it here.
 * See HOW_TO_EXTEND.md ("Neue Map").
 */
import { ARENA } from './arena';
import type { MapDef } from './mapTypes';

export const MAPS: Record<string, MapDef> = {
  [ARENA.id]: ARENA,
};

export const DEFAULT_MAP_ID = ARENA.id;

export function getMap(id: string): MapDef {
  const map = MAPS[id];
  if (!map) throw new Error(`Unknown map id: ${id}`);
  return map;
}

export type { Box, MapDef, SpawnPoint } from './mapTypes';
