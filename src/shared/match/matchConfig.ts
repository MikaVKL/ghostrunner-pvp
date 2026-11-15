/**
 * Match rules as data. The server can be started with a different config
 * (tests use very short timers so matches finish quickly).
 */
import { secondsToTicks } from '../config';

export interface MatchConfig {
  /** Players are frozen at their spawns for this long before each round. */
  countdownTicks: number;
  /** Maximum round length. When it runs out, the player with more HP wins the round. */
  roundTicks: number;
  /** Pause after a round before the next one starts. */
  roundEndTicks: number;
  /**
   * After the match: a rematch starts as soon as BOTH players asked for it (Room.handleRematch).
   * If this is > 0, a rematch also starts automatically after that many ticks.
   * 0 = wait for the players forever (they can also leave the room).
   */
  matchEndTicks: number;
  /** First player to win this many rounds wins the match. */
  roundsToWin: number;
  /** Hard limit so a match always ends, even with many draws. */
  maxRounds: number;
}

/**
 * Best-of-5: the first player with 3 round wins takes the match. Drawn rounds (double
 * kill, time ran out) give nobody a point; `maxRounds` makes sure the match still ends.
 */
export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  countdownTicks: secondsToTicks(3),
  roundTicks: secondsToTicks(60),
  roundEndTicks: secondsToTicks(2.5),
  matchEndTicks: 0,
  roundsToWin: 3,
  maxRounds: 9,
};

/** Short timers for automated tests and quick bot runs. */
export const FAST_MATCH_CONFIG: MatchConfig = {
  countdownTicks: secondsToTicks(0.3),
  roundTicks: secondsToTicks(20),
  roundEndTicks: secondsToTicks(0.3),
  matchEndTicks: secondsToTicks(1),
  roundsToWin: 2,
  maxRounds: 5,
};
