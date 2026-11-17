/**
 * Connects the pieces of the browser client: input, renderer, sound, UI and the game
 * clients. Effects for things that happen are in effects.ts.
 *
 * There can be two GameClients:
 *   online - connected to a game server over the network (null if none is reachable)
 *   solo   - connected to a local server + bot inside this tab (see src/solo/soloMatch.ts)
 * Everything on screen works with `current()`, whichever of the two is being played.
 */
import { GameClient } from '../../netcode/gameClient';
import { DIFFICULTIES, type Difficulty } from '../../solo/difficulty';
import { SoloMatch } from '../../solo/soloMatch';
import { AudioEngine } from '../audio/audioEngine';
import { playSound } from '../audio/sounds';
import { UI_KEYS } from '../input/bindings';
import { InputController } from '../input/inputController';
import { GameView } from '../render/gameView';
import { DebugOverlay } from '../ui/debugOverlay';
import { HelpOverlay } from '../ui/helpOverlay';
import { Hud } from '../ui/hud';
import { errorText, TEXT } from '../ui/hudTexts';
import { LobbyUi } from '../ui/lobbyUi';
import {
  forgetSeat,
  openTransport,
  reconnectLoop,
  rememberedSeat,
  rememberSeat,
  type ConnectionOptions,
} from './connection';
import { ReplayViewer } from '../replay/replayViewer';
import { Effects } from './effects';
import { TimeTrialMode } from './timeTrialMode';
import { setupReplays } from './replayWiring';
import { startGameLoop } from './gameLoop';
import { loadSettings, saveSettings, type Settings } from './settings';

export interface AppOptions {
  connection: ConnectionOptions;
  /** False turns client-side prediction off (URL option ?predict=0). */
  predict: boolean;
  debugInfo: string;
}

export function startGameApp(options: AppOptions): void {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const settings = loadSettings();
  const input = new InputController(canvas);
  const view = new GameView(canvas);
  const hud = new Hud();
  const audio = new AudioEngine();
  const help = new HelpOverlay();
  const effects = new Effects(view, hud, audio);
  const debug = new DebugOverlay(options.debugInfo);

  let online: GameClient | null = null;
  let solo: SoloMatch | null = null;
  let connecting = false;
  /** The client of the match on screen (a solo match wins over the idle online client). */
  // Assigned below, once `bind` exists.
  let trial: TimeTrialMode;
  const current = (): GameClient | null => solo?.client ?? trial?.client ?? online;

  const applySettings = (next: Settings) => {
    Object.assign(settings, next);
    audio.setVolume(next.volume);
    input.sensitivity = next.sensitivity;
    saveSettings(next);
  };
  applySettings(settings);

  // Browsers allow sound only after a click or key press.
  window.addEventListener('pointerdown', () => audio.unlock());
  window.addEventListener('keydown', () => audio.unlock());
  document.addEventListener('click', (event) => {
    if (event.target instanceof HTMLButtonElement) playSound(audio, 'click');
  });

  const showGame = (inGame: boolean) => {
    lobby.setVisible(!inGame);
    hud.setVisible(inGame);
    input.enabled = inGame;
    if (!inGame && document.pointerLockElement) document.exitPointerLock();
  };

  /** Look the way the spawn point faces (the server resets the player there). */
  const faceSpawnDirection = (client: GameClient) => {
    if (client.map && client.room) input.setView(client.map.spawns[client.room.slot].yaw, 0);
  };

  /** Connect a client's callbacks to the screen. Works the same for online and solo. */
  const bind = (client: GameClient, kind: 'online' | 'solo' | 'trial') => {
    client.onRoomJoined = (room) => {
      view.setMap(client.map!);
      faceSpawnDirection(client);
      if (kind === 'online') rememberSeat(room); // a solo match cannot be rejoined after a reload
      lobby.setStatus('');
      hud.setConnectionLost(false);
      showGame(true);
    };
    client.onRoomLeft = () => {
      if (kind === 'online') forgetSeat();
      else if (kind === 'trial') trial.end();
      else endSolo();
      hud.setConnectionLost(false);
      showGame(false);
    };
    client.onError = (_message, code) => lobby.setStatus(errorText(code));
    client.onPhaseChange = (phase, previous) => {
      if (phase === 'countdown') faceSpawnDirection(client);
      if (phase === 'waiting' && previous !== null) faceSpawnDirection(client);
    };
    client.onGameEvent = (event) => {
      if (kind === 'solo') replays.onSoloEvent(event);
      const frame = lastFrame();
      if (frame && client.room && current() === client) {
        effects.gameEvent(event, client.room.slot, frame.players, frame.listener);
      }
    };
    if (kind === 'online') client.onClose = () => onlineConnectionLost(client);
  };

  trial = new TimeTrialMode(hud, view, (client) => bind(client, 'trial'), options.predict);

  // ---------- online ----------

  /** Try to reach a game server. Without one, only the solo mode is offered. */
  const connectOnline = async () => {
    if (connecting || online) return;
    connecting = true;
    lobby.setOnlineState('connecting');
    try {
      const client = new GameClient(await openTransport(options.connection), { predict: options.predict });
      bind(client, 'online');
      online = client;
      lobby.setOnlineState('online');
      // After a page reload: take our old seat again, if the server still keeps it.
      const seat = rememberedSeat();
      if (seat && !solo) {
        lobby.setStatus(TEXT.restoringSeat);
        client.rejoinRoom(seat.code, seat.token);
      }
    } catch {
      lobby.setOnlineState('offline');
    } finally {
      connecting = false;
    }
  };

  /** The network connection broke: keep the picture, show a banner and try to get back in. */
  const onlineConnectionLost = (client: GameClient) => {
    const wasPlaying = current() === client && client.room !== null;
    if (wasPlaying) hud.setConnectionLost(true);
    lobby.setOnlineState('connecting');
    void reconnectLoop(client, options.connection).then((ok) => {
      if (ok) {
        lobby.setOnlineState('online');
        if (!client.room) hud.setConnectionLost(false);
        return;
      }
      // Gave up: multiplayer is off until the player retries. A solo match is not affected.
      online = null;
      lobby.setOnlineState('offline');
      hud.setConnectionLost(false);
      if (wasPlaying) {
        showGame(false);
        lobby.setStatus(TEXT.connectionGaveUp);
      }
    });
  };

  // ---------- solo ----------

  const startSolo = (name: string, mapId: string, difficulty: Difficulty) => {
    if (solo || trial.active || online?.room) return; // already in a match
    solo = new SoloMatch({
      playerName: name,
      mapId,
      difficulty,
      seed: Math.floor(Math.random() * 2 ** 31), // every match is different
      predict: options.predict,
    });
    bind(solo.client, 'solo');
    hud.setSoloLabel(`Solo · ${DIFFICULTIES[difficulty].label}`);
    solo.start();
  };

  const endSolo = () => {
    const match = solo;
    solo = null;
    hud.setSoloLabel(null);
    match?.dispose();
  };

  // ---------- menu, keys, loop ----------

  const lobby = new LobbyUi(settings, {
    onSolo: startSolo,
    onTimeTrial: (name, mapId) => {
      if (!solo && !trial.active && !online?.room) trial.start(name, mapId);
    },
    onQuickMatch: (name) => online?.quickMatch(name),
    onCreateRoom: (name, mapId) => online?.createRoom(name, mapId),
    onJoinRoom: (code, name) => online?.joinRoom(code, name),
    onRetryOnline: () => void connectOnline(),
    onSettingsChange: applySettings,
    onOpenHelp: () => help.setVisible(true),
  });

  const viewer = new ReplayViewer(view, input, effects);
  const replays = setupReplays({
    viewer,
    view,
    input,
    hud,
    lobby,
    getSolo: () => solo,
    current,
    showGame,
    killcamEnabled: () => settings.killcam,
  });

  const lastFrame = startGameLoop({
    replay: viewer,
    ghost: () => trial.ghost(),
    getClient: current,
    afterTick: () => {
      solo?.step();
      trial.step();
    },
    input,
    view,
    hud,
    debug,
    effects,
  });

  document.getElementById('leave-button')!.addEventListener('click', () => current()?.leaveRoom());
  document.getElementById('hud-help-button')!.addEventListener('click', () => help.toggle());
  window.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLInputElement) return; // typing a name or code
    if (event.code === UI_KEYS.help) help.toggle();
    if (event.code === UI_KEYS.mute) hud.toast(audio.toggleMute() ? TEXT.soundOff : TEXT.soundOn, 700);
    const client = current();
    if (event.code === UI_KEYS.rematch && client?.snapshot?.match.phase === 'matchEnd') client.requestRematch();
    if (event.code === UI_KEYS.rematch && trial.active) trial.restart(); // time trial: start over
  });

  // Debugging aids (also used by the browser tests): in the browser console,
  // `game` is the client of the current match and `gameInput.setView(yaw, pitch)` turns the camera.
  Object.defineProperty(window, 'game', { get: current, configurable: true });
  (window as unknown as { gameInput: InputController }).gameInput = input;
  (window as unknown as { gameReplay: ReplayViewer }).gameReplay = viewer;
  (window as unknown as { gameTrial: TimeTrialMode }).gameTrial = trial;

  void connectOnline();
}
