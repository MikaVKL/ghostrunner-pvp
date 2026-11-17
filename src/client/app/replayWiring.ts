/**
 * Connects the replay viewer to the rest of the app:
 *   - V or the "Replay" button during a solo match: watch the match so far
 *   - after a sword kill in solo: the killcam (can be switched off in the menu)
 *   - "Replay laden …" in the menu: watch a replay file
 * While a replay is shown, the solo match is frozen (the game loop does not tick it).
 */
import type { GameClient } from '../../netcode/gameClient';
import { parseReplay, type ReplayFile } from '../../shared/replay/replayFormat';
import type { GameEvent } from '../../shared/sim/events';
import type { SoloMatch } from '../../solo/soloMatch';
import { UI_KEYS } from '../input/bindings';
import type { InputController } from '../input/inputController';
import type { GameView } from '../render/gameView';
import { readTextFile } from '../replay/replayFiles';
import type { ReplayViewer } from '../replay/replayViewer';
import type { Hud } from '../ui/hud';
import { TEXT } from '../ui/hudTexts';
import type { LobbyUi } from '../ui/lobbyUi';

export interface ReplayDeps {
  viewer: ReplayViewer;
  view: GameView;
  input: InputController;
  hud: Hud;
  lobby: LobbyUi;
  getSolo: () => SoloMatch | null;
  current: () => GameClient | null;
  /** Show the match (true) or the menu (false), like after joining/leaving a room. */
  showGame: (inGame: boolean) => void;
  killcamEnabled: () => boolean;
}

export function setupReplays(deps: ReplayDeps): { onSoloEvent: (event: GameEvent) => void } {
  const { viewer, view, input, hud, lobby } = deps;

  /** Open the viewer over the match or the menu, and put everything back afterwards. */
  const watch = (open: (onClose: () => void) => void) => {
    const savedView = { yaw: input.yaw, pitch: input.pitch, enabled: input.enabled };
    const fromMenu = deps.current()?.room == null;
    lobby.setVisible(false);
    hud.setVisible(false);
    input.enabled = true; // the free camera uses the normal controls
    open(() => {
      input.setView(savedView.yaw, savedView.pitch);
      input.enabled = savedView.enabled;
      const map = deps.current()?.map;
      if (map) view.setMap(map);
      deps.showGame(!fromMenu);
    });
  };

  const watchSoloMatch = () => {
    const file = deps.getSolo()?.replay();
    if (file && !viewer.active) watch((onClose) => viewer.open(file, onClose));
  };

  const watchFile = (file: ReplayFile) => watch((onClose) => viewer.open(file, onClose));

  document.getElementById('replay-button')!.addEventListener('click', watchSoloMatch);
  window.addEventListener('keydown', (event) => {
    if (event.code !== UI_KEYS.replay || event.target instanceof HTMLInputElement) return;
    if (deps.getSolo()?.client.room) watchSoloMatch();
  });

  // "Replay laden …" in the menu opens a file picker.
  const picker = document.getElementById('replay-file') as HTMLInputElement;
  document.getElementById('replay-load-button')!.addEventListener('click', () => picker.click());
  picker.addEventListener('change', async () => {
    const chosen = picker.files?.[0];
    picker.value = ''; // so the same file can be picked again
    if (!chosen) return;
    const file = parseReplay(await readTextFile(chosen));
    if (!file) return lobby.setStatus(TEXT.replayInvalid);
    lobby.setStatus('');
    watchFile(file);
  });

  return {
    /** Every game event of the solo match: a sword kill starts the killcam. */
    onSoloEvent: (event) => {
      if (event.type !== 'hit' || event.hpLeft > 0 || !deps.killcamEnabled() || viewer.active) return;
      const file = deps.getSolo()?.replay();
      if (!file) return;
      watch((onClose) => viewer.openKillcam(file, { killer: event.attacker, victim: event.target }, onClose));
    },
  };
}
