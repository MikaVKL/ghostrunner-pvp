/**
 * Map registry. To add a map: create a file next to schlucht.ts and register it here.
 * See HOW_TO_EXTEND.md ("Neue Map").
 */
import { ARENA } from './arena';
import { DAECHER } from './daecher';
import type { MapDef } from './mapTypes';
import { REAKTOR } from './reaktor';
import { SCHLUCHT } from './schlucht';

export const MAPS: Record<string, MapDef> = {
  [SCHLUCHT.id]: SCHLUCHT,
  [DAECHER.id]: DAECHER,
  [REAKTOR.id]: REAKTOR,
  [ARENA.id]: ARENA,
};

/** Used when a room is created without choosing a map. */
export const DEFAULT_MAP_ID = SCHLUCHT.id;

/** Quick-match rooms take turns through these maps. */
export const MAP_ROTATION: string[] = [SCHLUCHT.id, DAECHER.id, REAKTOR.id];

export function isMapId(id: unknown): id is string {
  return typeof id === 'string' && Object.hasOwn(MAPS, id);
}

export function getMap(id: string): MapDef {
  if (!isMapId(id)) throw new Error(`Unknown map id: ${id}`);
  return MAPS[id];
}

export type { Box, JumpPad, MapDef, ParkourLink, SpawnPoint } from './mapTypes';
