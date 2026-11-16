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
import type { GameView } from '../render/gameView';
import type { DebugOverlay } from '../ui/debugOverlay';
import type { Hud } from '../ui/hud';
import type { Effects, Listener } from './effects';
import { detectMoments } from './stateWatcher';

/** Never run more than this many ticks in one frame (e.g. after the tab was in the background). */
const MAX_TICKS_PER_FRAME = 5;

export interface LoopParts {
  client: GameClient;
  input: InputController;
  view: GameView;
  hud: Hud;
  debug: DebugOverlay;
  effects: Effects;
}

/** What the last frame showed. gameApp.ts uses it to place the effects of game events. */
export interface FrameInfo {
  listener: Listener;
  /** The local player and the (interpolated) other players as drawn. */
  players: PlayerState[];
}

export function startGameLoop({ client, input, view, hud, debug, effects }: LoopParts): () => FrameInfo | null {
  let lastFrameAt = performance.now();
  let accumulator = 0;
  /** Position of the local player before the most recent tick. */
  let previousPos: Vec3 | null = null;
  /** Other players as shown in the previous frame (to notice when they start something). */
  const shownBefore = new Map<number, PlayerState>();
  let lastFrame: FrameInfo | null = null;

  /** One 60 Hz step: send the input, predict, and react to what our player just started. */
  const tick = () => {
    const before = client.localPlayer ? clonePlayer(client.localPlayer) : null;
    previousPos = before ? cloneVec3(before.pos) : null;
    client.tick(input.sample());
    const after = client.localPlayer;
    if (before && after) for (const moment of detectMoments(before, after)) effects.moment(moment, after, null);
  };

  const frame = (now: number) => {
    const deltaMs = Math.min(now - lastFrameAt, 250);
    lastFrameAt = now;
    accumulator += deltaMs;

    let ticks = 0;
    while (accumulator >= TICK_MS) {
      tick();
      accumulator -= TICK_MS;
      if (++ticks >= MAX_TICKS_PER_FRAME) accumulator = 0;
    }
    client.renderClock.advance(deltaMs);

    const me = client.localPlayer;
    if (me && client.room) {
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

      for (const remote of remotes) {
        const before = shownBefore.get(remote.slot);
        if (before) for (const moment of detectMoments(before, remote)) effects.moment(moment, remote, listener);
        shownBefore.set(remote.slot, remote);
      }
      effects.frame(me, remotes, client.snapshot?.match ?? null);
      lastFrame = { listener, players: [me, ...remotes] };

      view.render({ localPos, yaw: input.yaw, pitch: input.pitch, local: me, remotes, dt: deltaMs / 1000 });
      hud.update(client, input.pointerLocked);
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
