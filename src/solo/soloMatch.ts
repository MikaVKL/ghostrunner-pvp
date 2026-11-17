/**
 * Solo mode: a complete match against a bot inside ONE program, without any network.
 *
 * Nothing about the game is re-implemented here. The pieces are the same as online:
 *
 *   GameClient (human) ──loopback──┐
 *                                  ├── GameServer (the real server core: Room, stepWorld ...)
 *   Bot = GameClient + BotBrain ───┘
 *
 * Only two things differ: the "connections" are loopbacks in memory (loopback.ts), and
 * there is no timer - whoever owns the SoloMatch calls `step()` 60 times per second,
 * right after the human's `client.tick()`. In the browser that is the game loop, so the
 * match pauses automatically when the tab is in the background.
 */
import { Bot } from '../bots/bot';
import { GameClient } from '../netcode/gameClient';
import { GameServer } from '../server/gameServer';
import { DEFAULT_MATCH_CONFIG, type MatchConfig } from '../shared/match/matchConfig';
import type { ReplayFile } from '../shared/replay/replayFormat';
import { DIFFICULTIES, type Difficulty } from './difficulty';
import { createLoopback } from './loopback';

export interface SoloOptions {
  playerName: string;
  mapId: string;
  difficulty: Difficulty;
  /** Random seed of the bot. Same seed + same inputs = same match. */
  seed: number;
  /** Rules (default: the normal best-of-5 rules). Tests use shorter timers. */
  matchConfig?: MatchConfig;
  /** Set to false to turn the human's prediction off (URL option ?predict=0). */
  predict?: boolean;
}

export class SoloMatch {
  /** The human's client. Use it exactly like an online GameClient. */
  readonly client: GameClient;
  readonly bot: Bot;
  readonly server: GameServer;

  constructor(private readonly options: SoloOptions) {
    this.server = new GameServer({ matchConfig: options.matchConfig ?? DEFAULT_MATCH_CONFIG, recordReplays: true });
    const level = DIFFICULTIES[options.difficulty];

    const humanLink = createLoopback();
    this.server.attach(humanLink.server);
    this.client = new GameClient(humanLink.client, { predict: options.predict });

    const botLink = createLoopback();
    this.server.attach(botLink.server);
    this.bot = new Bot(botLink.client, { name: level.botName, seed: options.seed, personality: level.personality });
  }

  /**
   * Create the room and let the bot join. Assign the client's callbacks (onRoomJoined ...)
   * BEFORE calling this - with a loopback everything happens immediately.
   */
  start(): void {
    this.client.createRoom(this.options.playerName, this.options.mapId);
    const room = this.client.room;
    if (!room) throw new Error('Solo match: the local server did not create a room');
    this.bot.client.joinRoom(room.code, this.bot.name);
  }

  /** One simulation tick of the local server and of the bot. Call 60 times per second. */
  step(): void {
    this.server.tick();
    this.bot.tick();
    this.acceptRematch();
  }

  /** The bot is always up for another match: it votes as soon as the match is over. */
  private acceptRematch(): void {
    const match = this.bot.client.snapshot?.match;
    const slot = this.bot.client.room?.slot;
    if (match && slot !== undefined && match.phase === 'matchEnd' && match.rematchVotes[slot] !== true) {
      this.bot.client.requestRematch();
    }
  }

  /** The replay of this match so far (null before the match has started). */
  replay(): ReplayFile | null {
    const code = this.client.room?.code;
    const file = code ? (this.server.lobby.getRoom(code)?.replay() ?? null) : null;
    return file ? { ...file, seed: this.options.seed } : null;
  }

  /** End the match and free everything (the human goes back to the menu). */
  dispose(): void {
    this.bot.client.close();
    this.client.close();
  }
}
