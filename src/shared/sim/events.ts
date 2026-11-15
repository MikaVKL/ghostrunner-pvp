/**
 * Things that happened during a tick. The server sends them to the clients so they can
 * show effects (hit flash, sounds, messages). Events never change the simulation.
 */
export type DeathCause = 'hp' | 'fall';

export type GameEvent =
  | { type: 'hit'; attacker: number; target: number; damage: number; hpLeft: number }
  | { type: 'parry'; attacker: number; defender: number }
  | { type: 'death'; slot: number; cause: DeathCause }
  | { type: 'roundStart'; round: number }
  | { type: 'roundEnd'; round: number; winner: number }
  | { type: 'matchEnd'; winner: number };
