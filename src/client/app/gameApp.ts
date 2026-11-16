/**
 * Connects the pieces of the browser client: network client, input, renderer, sound and
 * UI. Effects for things that happen are in effects.ts.
 */
import type { GameClient } from '../../netcode/gameClient';
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
import { forgetSeat, reconnectLoop, rememberedSeat, rememberSeat, type ConnectionOptions } from './connection';
import { Effects } from './effects';
import { startGameLoop } from './gameLoop';
import { loadSettings, saveSettings, type Settings } from './settings';

export function startGameApp(client: GameClient, connection: ConnectionOptions, debugInfo: string): void {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const settings = loadSettings();
  const input = new InputController(canvas);
  const view = new GameView(canvas);
  const hud = new Hud();
  const audio = new AudioEngine();
  const help = new HelpOverlay();
  const effects = new Effects(view, hud, audio);
  const debug = new DebugOverlay(debugInfo);

  const applySettings = (next: Settings) => {
    audio.setVolume(next.volume);
    input.sensitivity = next.sensitivity;
    saveSettings(next);
  };
  applySettings(settings);
  const lobby = new LobbyUi(client, settings, {
    onSettingsChange: applySettings,
    onOpenHelp: () => help.setVisible(true),
  });

  // Browsers allow sound only after a click or key press.
  window.addEventListener('pointerdown', () => audio.unlock());
  window.addEventListener('keydown', () => audio.unlock());
  document.addEventListener('click', (event) => {
    if (event.target instanceof HTMLButtonElement) playSound(audio, 'click');
  });

  /** Look the way the spawn point faces (the server resets the player there). */
  const faceSpawnDirection = () => {
    if (client.map && client.room) input.setView(client.map.spawns[client.room.slot].yaw, 0);
  };

  const showGame = (inGame: boolean) => {
    lobby.setVisible(!inGame);
    hud.setVisible(inGame);
    input.enabled = inGame;
    if (!inGame && document.pointerLockElement) document.exitPointerLock();
  };

  client.onRoomJoined = (room) => {
    view.setMap(client.map!);
    faceSpawnDirection();
    rememberSeat(room);
    lobby.setStatus('');
    hud.setConnectionLost(false);
    showGame(true);
  };
  client.onRoomLeft = () => {
    forgetSeat();
    hud.setConnectionLost(false);
    showGame(false);
  };
  client.onError = (_message, code) => lobby.setStatus(errorText(code));
  client.onClose = () => {
    // Connection lost: keep the picture, show a banner and try to get back in.
    hud.setConnectionLost(true);
    lobby.setStatus(TEXT.connectionLost);
    void reconnectLoop(client, connection).then((ok) => {
      if (ok) {
        if (!client.room) lobby.setStatus('');
        return;
      }
      showGame(false);
      lobby.setStatus(TEXT.connectionGaveUp);
    });
  };
  client.onPhaseChange = (phase, previous) => {
    if (phase === 'countdown') faceSpawnDirection();
    if (phase === 'waiting' && previous !== null) faceSpawnDirection();
  };

  const lastFrame = startGameLoop({ client, input, view, hud, debug, effects });
  client.onGameEvent = (event) => {
    const frame = lastFrame();
    if (frame && client.room) effects.gameEvent(event, client.room.slot, frame.players, frame.listener);
  };

  document.getElementById('leave-button')!.addEventListener('click', () => client.leaveRoom());
  document.getElementById('hud-help-button')!.addEventListener('click', () => help.toggle());
  window.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLInputElement) return; // typing a name or code
    if (event.code === UI_KEYS.help) help.toggle();
    if (event.code === UI_KEYS.mute) hud.toast(audio.toggleMute() ? TEXT.soundOff : TEXT.soundOn, 700);
    if (event.code === UI_KEYS.rematch && client.snapshot?.match.phase === 'matchEnd') client.requestRematch();
  });

  // After a page reload: take our old seat again, if the server still keeps it.
  const seat = rememberedSeat();
  if (seat) {
    lobby.setStatus(TEXT.restoringSeat);
    client.rejoinRoom(seat.code, seat.token);
  }

  // Debugging aid (also used by the browser tests): `gameInput.setView(yaw, pitch)`.
  (window as unknown as { gameInput: InputController }).gameInput = input;
}
