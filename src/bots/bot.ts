/**
 * A bot = the normal GameClient (same netcode as a human) + a BotBrain pressing the buttons.
 */
import type { Transport } from '../shared/protocol/transport';
import { GameClient } from '../netcode/gameClient';
import { BotBrain, type BotPersonality } from './brain';

export interface BotOptions {
  name: string;
  seed: number;
  personality?: BotPersonality;
  /** Clock for ping measurement (virtual time in simulations). */
  now?: () => number;
}

export class Bot {
  readonly client: GameClient;
  readonly name: string;
  /** Winner slot of the last finished match (-1 = draw), or null if none finished yet. */
  matchWinner: number | null = null;
  roundsPlayed = 0;
  /** Exceptions thrown inside the bot's own tick. */
  readonly errors: string[] = [];
  private readonly brain: BotBrain;

  constructor(transport: Transport, options: BotOptions) {
    this.name = options.name;
    this.brain = new BotBrain(options.seed, options.personality);
    this.client = new GameClient(transport, { now: options.now });
    this.client.onGameEvent = (event) => {
      if (event.type === 'roundEnd') this.roundsPlayed++;
      if (event.type === 'matchEnd') this.matchWinner = event.winner;
    };
  }

  get matchFinished(): boolean {
    return this.matchWinner !== null;
  }

  /** Call 60 times per second (real or virtual time). */
  tick(): void {
    try {
      const { client } = this;
      const me = client.localPlayer;
      if (!me || !client.map) {
        client.tick({ moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons: 0 });
        return;
      }
      client.tick(this.brain.think(me, client.opponent, client.map));
    } catch (error) {
      this.errors.push(error instanceof Error ? (error.stack ?? error.message) : String(error));
    }
  }
}
