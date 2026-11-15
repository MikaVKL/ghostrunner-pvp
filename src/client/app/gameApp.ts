/**
 * Connects the pieces of the browser client: network client, input, renderer and UI.
 * This is the place to react to game events with effects (sounds, particles, messages).
 */
import type { GameEvent } from '../../shared/sim/events';
import type { GameClient } from '../../netcode/gameClient';
import { InputController } from '../input/inputController';
import { GameView } from '../render/gameView';
import { DebugOverlay } from '../ui/debugOverlay';
import { Hud } from '../ui/hud';
import { LobbyUi } from '../ui/lobbyUi';
import { startGameLoop } from './gameLoop';

export function startGameApp(client: GameClient, debugInfo: string): void {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const input = new InputController(canvas);
  const view = new GameView(canvas);
  const hud = new Hud();
  const lobby = new LobbyUi(client);
  const debug = new DebugOverlay(debugInfo);

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

  client.onRoomJoined = () => {
    view.setMap(client.map!);
    faceSpawnDirection();
    lobby.setStatus('');
    showGame(true);
  };
  client.onRoomLeft = () => showGame(false);
  client.onError = (message) => lobby.setStatus(message);
  client.onClose = () => {
    showGame(false);
    lobby.setStatus('Connection lost. Please reload the page.');
  };
  client.onPhaseChange = (phase, previous) => {
    if (phase === 'countdown') faceSpawnDirection();
    if (phase === 'playing' && previous === 'countdown') hud.toast('FIGHT!');
    if (phase === 'waiting' && previous !== null) faceSpawnDirection();
  };
  client.onGameEvent = (event) => showEventFeedback(event, client.room?.slot ?? -1, hud);

  document.getElementById('leave-button')!.addEventListener('click', () => client.leaveRoom());
  startGameLoop({ client, input, view, hud, debug });
}

/** Visual feedback for things that happened. Add sounds/particles here later. */
function showEventFeedback(event: GameEvent, mySlot: number, hud: Hud): void {
  switch (event.type) {
    case 'hit':
      if (event.target === mySlot) hud.flashDamage();
      else hud.toast('HIT!', 400);
      return;
    case 'parry':
      hud.toast(event.attacker === mySlot ? 'PARRIED - you are stunned!' : 'PARRY!', 800);
      return;
    case 'death':
      if (event.slot === mySlot && event.cause === 'fall') hud.flashDamage();
      return;
    default:
      return;
  }
}
