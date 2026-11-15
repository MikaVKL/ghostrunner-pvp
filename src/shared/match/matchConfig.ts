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
  /** Pause after the match before a rematch starts automatically. */
  matchEndTicks: number;
  /** First player to win this many rounds wins the match. */
  roundsToWin: number;
  /** Hard limit so a match always ends, even with many draws. */
  maxRounds: number;
}

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  countdownTicks: secondsToTicks(3),
  roundTicks: secondsToTicks(60),
  roundEndTicks: secondsToTicks(3),
  matchEndTicks: secondsToTicks(6),
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
