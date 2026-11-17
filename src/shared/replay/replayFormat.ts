/**
 * The replay file format. A replay does NOT store pictures or positions over time - only
 * what is needed to calculate the match again, exactly:
 *
 *   startWorld   the complete world at the moment recording began
 *   ticks        for every following tick, the input of every player (as the server used it)
 *   actions      the few changes the server made outside of stepWorld (rematch votes)
 *
 * Because the simulation is deterministic (CLAUDE.md, rule 2), stepping `startWorld` with
 * these inputs gives exactly the same match. `checkpoints` and `finalHash` let a player of
 * the replay prove that: if a hash differs, the replay does not match this game version.
 */
import type { InputCmd } from '../input';
import { isModeId, type ModeId } from '../match/gameModes';
import type { MatchConfig } from '../match/matchConfig';
import type { WorldState } from '../sim/world';

export const REPLAY_FORMAT = 'neonklinge-replay';
export const REPLAY_VERSION = 2;

/** One input packed into an array (keeps files small): [moveX, moveZ, yaw, pitch, buttons, viewTick]. */
export type PackedInput = [number, number, number, number, number, number];

/** Something the server did to the world between two ticks. */
export interface ReplayAction {
  /** Applied when the world is at this tick, before the next step. */
  tick: number;
  type: 'rematch';
  slot: number;
}

export interface ReplayFile {
  format: typeof REPLAY_FORMAT;
  version: number;
  /** PROTOCOL_VERSION of the game that recorded it (rules may differ between versions). */
  protocol: number;
  mapId: string;
  /** Game mode (rules) of the match. */
  modeId: ModeId;
  matchConfig: MatchConfig;
  /**
   * Random seed of the recording. The simulation itself uses no randomness; this is the
   * seed of the solo bot, kept so a match can be set up again with the same opponent.
   */
  seed: number;
  players: { slot: number; name: string }[];
  startWorld: WorldState;
  /** ticks[i][slot]: input of that player in tick startWorld.tick + i + 1 (null = none). */
  ticks: (PackedInput | null)[][];
  actions: ReplayAction[];
  /** hashState(world) after every 60th tick, to find the first tick where a replay goes wrong. */
  checkpoints: { tick: number; hash: number }[];
  /** hashState(world) after the last tick. */
  finalHash: number;
}

/**
 * JSON turns -0 into 0. The simulation must get back exactly what was recorded, so -0 is
 * stored as this marker (a string, so it cannot be mistaken for a number).
 */
const NEGATIVE_ZERO = '-0';

function packNumber(value: number): number | string {
  return Object.is(value, -0) ? NEGATIVE_ZERO : value;
}

function unpackNumber(value: unknown): number {
  return value === NEGATIVE_ZERO ? -0 : (value as number);
}

export function packInput(cmd: InputCmd): PackedInput {
  return [cmd.moveX, cmd.moveZ, cmd.yaw, cmd.pitch, cmd.buttons, cmd.viewTick].map(packNumber) as PackedInput;
}

export function unpackInput(packed: PackedInput, seq = 0): InputCmd {
  const [moveX, moveZ, yaw, pitch, buttons, viewTick] = packed.map(unpackNumber);
  return { seq, moveX, moveZ, yaw, pitch, buttons, viewTick };
}

/** Deep copy of plain data that keeps -0 (structuredClone does; JSON would not). */
export function copyWorld(world: WorldState): WorldState {
  return structuredClone(world);
}

/** Replay -> text for a file. -0 inside the world is kept the same way as in inputs. */
export function serializeReplay(file: ReplayFile): string {
  return JSON.stringify(file, (_key, value: unknown) =>
    typeof value === 'number' && Object.is(value, -0) ? NEGATIVE_ZERO : value,
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Text from a file -> replay, or null if it is not a valid replay of this game.
 * Only the shape is checked; whether it really belongs to this game version shows when
 * playing it (checkpoint hashes).
 */
export function parseReplay(text: string): ReplayFile | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text, (_key, value: unknown) => (value === NEGATIVE_ZERO ? -0 : value));
  } catch {
    return null;
  }
  if (!isObject(raw) || raw.format !== REPLAY_FORMAT || raw.version !== REPLAY_VERSION) return null;
  if (typeof raw.mapId !== 'string' || !isObject(raw.matchConfig) || !isObject(raw.startWorld)) return null;
  if (!isModeId(raw.modeId)) return null;
  if (!Array.isArray(raw.ticks) || !Array.isArray(raw.actions) || !Array.isArray(raw.checkpoints)) return null;
  if (!Array.isArray(raw.players) || typeof raw.finalHash !== 'number') return null;
  const world = raw.startWorld;
  if (!Array.isArray(world.players) || typeof world.tick !== 'number' || !isObject(world.match)) return null;
  return raw as unknown as ReplayFile;
}
