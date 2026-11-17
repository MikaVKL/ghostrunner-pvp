/**
 * A bot = the normal GameClient (same netcode as a human) + a BotBrain pressing the buttons.
 */
import { TICK_MS } from '../shared/config';
import { MOVE } from '../shared/movement/movementConfig';
import type { Transport } from '../shared/protocol/transport';
import { phaseAllowsAction } from '../shared/sim/world';
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
  doubleJumps: number;
  padLaunches: number;
  /** Blade clashes this bot was part of. */
  clashes: number;
  /** Dashes out of the way of a swing. */
  dodges: number;
  /** Hits on a stunned or recovering opponent. */
  punishes: number;
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
  readonly usage: BotUsage = {
    wallRunTicks: 0, wallJumps: 0, doubleJumps: 0, padLaunches: 0, clashes: 0, dodges: 0, punishes: 0, dashes: 0, swings: 0, dashAttacks: 0, parries: 0, kills: 0,
  };
  private readonly brain: BotBrain;
  /** Own state one tick ago, to notice when something starts. */
  private before = { wallRunning: false, dashing: false, attacking: false, grounded: true, airJumpsLeft: 0 };

  constructor(transport: Transport, options: BotOptions) {
    this.name = options.name;
    this.brain = new BotBrain(options.seed, options.personality);
    this.client = new GameClient(transport, { now: options.now });
    this.client.onGameEvent = (event) => {
      const mySlot = this.client.room?.slot;
      if (event.type === 'roundEnd') this.roundsPlayed++;
      if (event.type === 'matchEnd') this.matchWinner = event.winner;
      if (event.type === 'parry' && event.defender === mySlot) this.usage.parries++;
      if (event.type === 'clash' && (event.a === mySlot || event.b === mySlot)) this.usage.clashes++;
      if (event.type === 'hit' && event.attacker === mySlot && event.hpLeft === 0) this.usage.kills++;
    };
  }

  get matchFinished(): boolean {
    return this.matchWinner !== null;
  }

  private countUsage(): void {
    const me = this.client.localPlayer;
    if (!me) return;
    this.usage.dodges = this.brain.fightStats.dodges;
    this.usage.punishes = this.brain.fightStats.punishes;
    const now = {
      wallRunning: me.wallRunning,
      dashing: me.dashTicks > 0,
      attacking: me.action === 'attack',
      grounded: me.grounded,
      airJumpsLeft: me.airJumpsLeft,
    };
    if (!this.before.grounded && !now.grounded && now.airJumpsLeft < this.before.airJumpsLeft) this.usage.doubleJumps++;
    if (this.before.grounded && !now.grounded && me.vel.y > MOVE.jumpSpeed + 0.5) this.usage.padLaunches++;
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
      client.renderClock.advance(TICK_MS);
      const me = client.localPlayer;
      if (!me || !client.map) {
        client.tick({ moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons: 0 });
        return;
      }
      // Like a human, the bot sees the opponent interpolated, slightly in the past.
      const enemySlot = client.opponent?.slot;
      const enemy = enemySlot === undefined ? null : (client.sampleRemote(enemySlot) ?? client.opponent);
      // Frozen during countdown / after the round: the brain must know, or it thinks it is stuck.
      const canAct = me.alive && phaseAllowsAction(client.snapshot?.match.phase ?? 'waiting');
      client.tick(this.brain.think(me, enemy, client.map, canAct));
      this.countUsage();
    } catch (error) {
      this.errors.push(error instanceof Error ? (error.stack ?? error.message) : String(error));
    }
  }
}
