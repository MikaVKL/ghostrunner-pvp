/**
 * The browser's main loop.
 *
 * The screen redraws as often as it can (requestAnimationFrame), but the game logic runs
 * in fixed 60 Hz ticks. An "accumulator" collects the real time that has passed and we
 * run one tick for every full 16.67 ms in it. Between ticks we draw a blend of the last
 * two positions so movement looks smooth on any display.
 */
import { TICK_MS } from '../../shared/config';
import { cloneVec3, lerpVec3, type Vec3 } from '../../shared/math/vec3';
import { clonePlayer, type PlayerState } from '../../shared/sim/playerState';
import type { GameClient } from '../../netcode/gameClient';
import type { InputController } from '../input/inputController';
import type { GameView, ViewState } from '../render/gameView';
import type { DebugOverlay } from '../ui/debugOverlay';
import type { Hud } from '../ui/hud';
import { ContactWatcher } from './contactWatcher';
import type { Effects, Listener } from './effects';
import { detectMoments } from './stateWatcher';

/** Never run more than this many ticks in one frame (e.g. after the tab was in the background). */
const MAX_TICKS_PER_FRAME = 5;

export interface LoopParts {
  /** While a replay is shown, it is drawn instead of the match, and the match is not ticked. */
  replay: { readonly active: boolean; frame: (deltaMs: number) => void };
  /** The client whose match is on screen: online or solo. Null = neither exists. */
  getClient: () => GameClient | null;
  /** Called after every 60 Hz tick (the solo mode steps its local server here). */
  afterTick: () => void;
  input: InputController;
  view: GameView;
  hud: Hud;
  debug: DebugOverlay;
  effects: Effects;
  /** Is the wind-up cue on for this client's match? (setting + game mode) */
  windupCue: (client: GameClient) => boolean;
  /** Look-and-feel settings for the renderer. */
  fx: () => ViewState['fx'];
  /** Called after every drawn frame of a match (frame rate watch, see frameRateGuard.ts). */
  onMatchFrame: (deltaMs: number) => void;
}

/** What the last frame showed. gameApp.ts uses it to place the effects of game events. */
export interface FrameInfo {
  listener: Listener;
  /** The local player and the (interpolated) other players as drawn. */
  players: PlayerState[];
}

export function startGameLoop(parts: LoopParts): () => FrameInfo | null {
  const { getClient, afterTick, input, view, hud, debug, effects, replay, windupCue, fx, onMatchFrame } = parts;
  const contacts = new ContactWatcher();
  let lastFrameAt = performance.now();
  let accumulator = 0;
  /** Position of the local player before the most recent tick. */
  let previousPos: Vec3 | null = null;
  /** Other players as shown in the previous frame (to notice when they start something). */
  const shownBefore = new Map<number, PlayerState>();
  let lastFrame: FrameInfo | null = null;
  let shownClient: GameClient | null = null;

  /** One 60 Hz step: send the input, predict, and react to what our player just started. */
  const tick = (client: GameClient) => {
    const before = client.localPlayer ? clonePlayer(client.localPlayer) : null;
    previousPos = before ? cloneVec3(before.pos) : null;
    client.tick(input.sample());
    const after = client.localPlayer;
    if (before && after) for (const moment of detectMoments(before, after)) effects.moment(moment, after, null);
    afterTick();
  };

  const frame = (now: number) => {
    const deltaMs = Math.min(now - lastFrameAt, 250);
    lastFrameAt = now;
    if (replay.active) {
      replay.frame(deltaMs);
      accumulator = 0; // the match is frozen meanwhile - do not catch up afterwards
      requestAnimationFrame(frame);
      return;
    }
    accumulator += deltaMs;

    const client = getClient();
    if (client !== shownClient) {
      // Switched between online and solo: forget everything about the old match.
      shownClient = client;
      previousPos = null;
      shownBefore.clear();
    }
    let ticks = 0;
    while (accumulator >= TICK_MS) {
      if (client) tick(client);
      accumulator -= TICK_MS;
      if (++ticks >= MAX_TICKS_PER_FRAME) accumulator = 0;
    }
    client?.renderClock.advance(deltaMs);
    if (replay.active) {
      // A tick of this frame opened a replay (killcam): do not draw or update the HUD anymore.
      requestAnimationFrame(frame);
      return;
    }

    const me = client?.localPlayer ?? null;
    if (client && me && client.room) {
      const mySlot = client.room.slot;
      const remotes = (client.snapshot?.players ?? [])
        .filter((p) => p.slot !== mySlot)
        .map((p) => client.sampleRemote(p.slot))
        .filter((p): p is PlayerState => p !== null);

      // Blend between the previous and the current tick, plus the soft correction offset.
      const blended = previousPos ? lerpVec3(previousPos, me.pos, accumulator / TICK_MS) : me.pos;
      const offset = client.correctionOffset;
      const localPos = { x: blended.x + offset.x, y: blended.y + offset.y, z: blended.z + offset.z };
      const listener: Listener = { pos: localPos, yaw: input.yaw };
      const cue = windupCue(client);
      effects.windupCue = cue;

      for (const remote of remotes) {
        const before = shownBefore.get(remote.slot);
        if (before) for (const moment of detectMoments(before, remote)) effects.moment(moment, remote, listener);
        shownBefore.set(remote.slot, remote);
      }
      effects.frame(me, remotes, client.snapshot?.match ?? null);
      lastFrame = { listener, players: [me, ...remotes] };
      // Our swing reached the enemy as shown: spark + tick at once (the server decides the rest).
      const touched = contacts.check(me, remotes);
      if (touched) effects.contact(touched);

      const animMs = effects.hitstop.advance(deltaMs);
      view.render({
        localPos,
        yaw: input.yaw,
        pitch: input.pitch,
        local: me,
        remotes,
        dt: deltaMs / 1000,
        animDt: animMs / 1000,
        windupCue: cue,
        fx: fx(),
        combatLive: client.snapshot?.match.phase === 'playing',
      });
      hud.update(client, input.pointerLocked);
      onMatchFrame(deltaMs);
    } else {
      shownBefore.clear();
      lastFrame = null;
    }
    debug.update(client);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return () => lastFrame;
}
