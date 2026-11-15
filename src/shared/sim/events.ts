/**
 * Things that happened during a tick. The server sends them to the clients so they can
 * show effects (hit flash, sounds, messages). Events never change the simulation.
 */
import type { AttackKind } from '../combat/weapons';

export type DeathCause = 'hp' | 'fall';

export type GameEvent =
  | { type: 'hit'; attacker: number; target: number; kind: AttackKind; damage: number; hpLeft: number }
  | { type: 'parry'; attacker: number; defender: number }
  | { type: 'death'; slot: number; cause: DeathCause }
  | { type: 'roundStart'; round: number }
  | { type: 'roundEnd'; round: number; winner: number }
  | { type: 'matchEnd'; winner: number };
