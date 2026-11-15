/**
 * The network side of a game client, without any browser or rendering code.
 * The browser client and the test bots both use this class.
 *
 * Usage:
 *   const client = new GameClient(transport);
 *   client.createRoom('Mika');             // or joinRoom / quickMatch
 *   every tick (60x per second):  client.tick(inputSample);
 *   read:  client.localPlayer, client.sampleRemote(slot), client.snapshot, client.stats
 */
import { sanitizeInput, type InputSample } from '../shared/input';
import { getMap, type MapDef } from '../shared/maps';
import { cloneVec3, type Vec3 } from '../shared/math/vec3';
import { encodeMessage, parseServerMessage } from '../shared/protocol/codec';
import type {
  ClientMessage,
  RoomPlayerInfo,
  ServerMessage,
  SnapshotMessage,
} from '../shared/protocol/messages';
import type { Transport } from '../shared/protocol/transport';
import type { GameEvent } from '../shared/sim/events';
import type { PlayerState } from '../shared/sim/playerState';
import type { MatchPhase } from '../shared/sim/world';
import { assertNever } from '../shared/util/assertNever';
import { listDifferences } from '../shared/sim/stateDiff';
import { RenderClock, SnapshotBuffer } from './interpolation';
import { createNetStats, PREDICTION_EPSILON, recordDesync } from './netStats';
import { Predictor } from './predictor';

const PING_EVERY_TICKS = 30;
/** Per tick, the visual correction offset shrinks to this fraction (smooth catch-up). */
const CORRECTION_DECAY = 0.85;
/** Corrections larger than this are shown instantly (teleport/respawn), not smoothed. */
const CORRECTION_SNAP_DISTANCE = 3;

export interface RoomInfo {
  code: string;
  /** Our own player slot. */
  slot: number;
  mapId: string;
  players: RoomPlayerInfo[];
}

export interface GameClientOptions {
  /** Set to false to turn prediction off and see raw server lag (for learning/debugging). */
  predict?: boolean;
  /** Clock in milliseconds, replaceable for tests. */
  now?: () => number;
}

export class GameClient {
  readonly stats = createNetStats();
  /** Recent snapshots, for interpolating other players. */
  readonly remotes = new SnapshotBuffer();
  readonly renderClock = new RenderClock();
  /**
   * When a correction moves the predicted player, the renderer adds this offset so the
   * camera glides to the corrected position instead of jumping.
   */
  readonly correctionOffset: Vec3 = { x: 0, y: 0, z: 0 };

  room: RoomInfo | null = null;
  map: MapDef | null = null;
  /** The newest snapshot received from the server. */
  snapshot: SnapshotMessage | null = null;
  connected = true;

  // Assign these to react to things happening.
  onRoomJoined: (room: RoomInfo) => void = () => {};
  onRoomUpdate: (room: RoomInfo) => void = () => {};
  onRoomLeft: () => void = () => {};
  onGameEvent: (event: GameEvent) => void = () => {};
  /** Called when the match phase changes (previous is null for the first snapshot). */
  onPhaseChange: (phase: MatchPhase, previous: MatchPhase | null) => void = () => {};
  onError: (message: string) => void = () => {};
  onClose: () => void = () => {};

  private readonly predictor = new Predictor();
  private readonly predict: boolean;
  private readonly now: () => number;
  private nextSeq = 1;
  private tickCount = 0;

  constructor(
    private readonly transport: Transport,
    options: GameClientOptions = {},
  ) {
    this.predict = options.predict ?? true;
    this.now = options.now ?? (() => performance.now());
    transport.onMessage = (data) => this.handleMessage(data);
    transport.onClose = () => {
      this.connected = false;
      this.room = null;
      this.onClose();
    };
  }

  // ---------- lobby ----------

  createRoom(name: string): void {
    this.send({ type: 'createRoom', name });
  }

  joinRoom(code: string, name: string): void {
    this.send({ type: 'joinRoom', code, name });
  }

  quickMatch(name: string): void {
    this.send({ type: 'quickMatch', name });
  }

  leaveRoom(): void {
    this.send({ type: 'leaveRoom' });
  }

  /** Ask for a rematch after the match has ended (starts when both players asked). */
  requestRematch(): void {
    this.send({ type: 'rematch' });
  }

  close(): void {
    this.transport.close();
  }

  // ---------- game ----------

  /** Our own player: predicted ahead of the server (or the raw server state if predict=false). */
  get localPlayer(): PlayerState | null {
    return this.predictor.state;
  }

  /** The other player as of the newest snapshot (not smoothed). Null if alone. */
  get opponent(): PlayerState | null {
    const mySlot = this.room?.slot;
    return this.snapshot?.players.find((p) => p.slot !== mySlot) ?? null;
  }

  /** Another player, smoothly interpolated for rendering. */
  sampleRemote(slot: number): PlayerState | null {
    return this.remotes.sample(this.renderClock.renderTick, slot);
  }

  /**
   * Call exactly once per client tick (60 Hz) with what the player is pressing.
   * Sends the input to the server and predicts its effect immediately.
   */
  tick(sample: InputSample): void {
    this.tickCount++;
    if (this.tickCount % PING_EVERY_TICKS === 0) this.send({ type: 'ping', t: this.now() });
    this.correctionOffset.x *= CORRECTION_DECAY;
    this.correctionOffset.y *= CORRECTION_DECAY;
    this.correctionOffset.z *= CORRECTION_DECAY;

    // Inputs are only sent once we know our starting state (first snapshot received).
    if (!this.room || !this.map || !this.snapshot || !this.predictor.state) return;
    const cmd = sanitizeInput({ ...sample, seq: this.nextSeq });
    if (!cmd) return;
    this.nextSeq++;
    this.send({ type: 'input', cmd });
    this.stats.inputsSent++;
    if (this.predict) this.predictor.predict(cmd, this.map, this.snapshot.match.phase);
  }

  // ---------- incoming messages ----------

  private send(message: ClientMessage): void {
    if (this.connected) this.transport.send(encodeMessage(message));
  }

  private handleMessage(data: string): void {
    const message = parseServerMessage(data);
    if (message) this.handleServerMessage(message);
  }

  private handleServerMessage(message: ServerMessage): void {
    switch (message.type) {
      case 'welcome':
        return;
      case 'roomJoined':
        this.resetGameState();
        this.room = {
          code: message.code,
          slot: message.slot,
          mapId: message.mapId,
          players: message.players,
        };
        this.map = getMap(message.mapId);
        this.onRoomJoined(this.room);
        return;
      case 'roomUpdate':
        if (!this.room) return;
        this.room.players = message.players;
        this.onRoomUpdate(this.room);
        return;
      case 'roomLeft':
        this.room = null;
        this.resetGameState();
        this.onRoomLeft();
        return;
      case 'snapshot':
        this.handleSnapshot(message);
        return;
      case 'pong':
        this.stats.rttMs = this.now() - message.t;
        return;
      case 'error':
        this.stats.serverErrors.push(`${message.code}: ${message.message}`);
        this.onError(message.message);
        return;
      default:
        assertNever(message);
    }
  }

  private resetGameState(): void {
    this.snapshot = null;
    this.predictor.reset();
    this.remotes.clear();
    this.renderClock.reset();
    this.nextSeq = 1;
  }

  private handleSnapshot(snapshot: SnapshotMessage): void {
    if (!this.room || !this.map) return;
    const previousPhase = this.snapshot?.match.phase ?? null;
    this.snapshot = snapshot;
    this.stats.snapshots++;
    this.remotes.push(snapshot.tick, snapshot.players);
    this.renderClock.onSnapshot(snapshot.tick);

    const me = snapshot.players.find((p) => p.slot === this.room!.slot);
    if (me) this.reconcile(me, snapshot, this.map);
    for (const event of snapshot.events) this.onGameEvent(event);
    if (snapshot.match.phase !== previousPhase) this.onPhaseChange(snapshot.match.phase, previousPhase);
  }

  /** Compare our prediction with the server's truth, then roll back and replay. */
  private reconcile(me: PlayerState, snapshot: SnapshotMessage, map: MapDef): void {
    const before = this.predictor.state ? cloneVec3(this.predictor.state.pos) : null;
    const result = this.predictor.reconcile(me, snapshot.ack, map, snapshot.match.phase);
    this.stats.pendingInputs = result.replayed;

    if (result.compared && result.difference > PREDICTION_EPSILON) {
      if (snapshot.clean) {
        const fields = listDifferences(result.predicted, me, PREDICTION_EPSILON).join(', ');
        recordDesync(this.stats, `tick ${snapshot.tick}, ack ${snapshot.ack}: ${fields}`);
      } else {
        this.stats.corrections++;
        if (result.positionError > CORRECTION_SNAP_DISTANCE) this.stats.teleports++;
        else this.stats.maxCorrection = Math.max(this.stats.maxCorrection, result.positionError);
      }
    }
    if (before && this.predict) this.smoothCorrection(before, this.predictor.state!.pos);
  }

  /** Hide small position corrections by letting the rendered position catch up gradually. */
  private smoothCorrection(before: Vec3, after: Vec3): void {
    const offset = this.correctionOffset;
    offset.x += before.x - after.x;
    offset.y += before.y - after.y;
    offset.z += before.z - after.z;
    if (Math.hypot(offset.x, offset.y, offset.z) > CORRECTION_SNAP_DISTANCE) {
      offset.x = offset.y = offset.z = 0;
    }
  }
}
