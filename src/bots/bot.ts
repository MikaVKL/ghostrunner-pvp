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

/** How often the bot used each mechanic - proves that the bot matches cover them. */
export interface BotUsage {
  wallRunTicks: number;
  wallJumps: number;
  dashes: number;
  swings: number;
  dashAttacks: number;
  /** Parries of this bot that blocked a swing. */
  parries: number;
  kills: number;
}

export class Bot {
  readonly client: GameClient;
  readonly name: string;
  /** Winner slot of the last finished match (-1 = draw), or null if none finished yet. */
  matchWinner: number | null = null;
  roundsPlayed = 0;
  /** Exceptions thrown inside the bot's own tick. */
  readonly errors: string[] = [];
  readonly usage: BotUsage = { wallRunTicks: 0, wallJumps: 0, dashes: 0, swings: 0, dashAttacks: 0, parries: 0, kills: 0 };
  private readonly brain: BotBrain;
  /** Own state one tick ago, to notice when something starts. */
  private before = { wallRunning: false, dashing: false, attacking: false };

  constructor(transport: Transport, options: BotOptions) {
    this.name = options.name;
    this.brain = new BotBrain(options.seed, options.personality);
    this.client = new GameClient(transport, { now: options.now });
    this.client.onGameEvent = (event) => {
      const mySlot = this.client.room?.slot;
      if (event.type === 'roundEnd') this.roundsPlayed++;
      if (event.type === 'matchEnd') this.matchWinner = event.winner;
      if (event.type === 'parry' && event.defender === mySlot) this.usage.parries++;
      if (event.type === 'hit' && event.attacker === mySlot && event.hpLeft === 0) this.usage.kills++;
    };
  }

  get matchFinished(): boolean {
    return this.matchWinner !== null;
  }

  private countUsage(): void {
    const me = this.client.localPlayer;
    if (!me) return;
    const now = { wallRunning: me.wallRunning, dashing: me.dashTicks > 0, attacking: me.action === 'attack' };
    if (now.wallRunning) this.usage.wallRunTicks++;
    // A wall-run that ends with upward speed was ended by a wall-jump.
    if (this.before.wallRunning && !now.wallRunning && me.vel.y > 5) this.usage.wallJumps++;
    if (now.dashing && !this.before.dashing) this.usage.dashes++;
    if (now.attacking && !this.before.attacking) {
      this.usage.swings++;
      if (me.attackKind === 'dash') this.usage.dashAttacks++;
    }
    this.before = now;
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
      this.countUsage();
    } catch (error) {
      this.errors.push(error instanceof Error ? (error.stack ?? error.message) : String(error));
    }
  }
}
