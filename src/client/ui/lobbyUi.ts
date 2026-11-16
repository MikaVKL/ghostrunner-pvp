/**
 * The main menu: name, map, "Solo gegen Bot" with a difficulty, the multiplayer buttons
 * (quick match, create room, join by code), settings and the controls help.
 *
 * The menu does not know HOW a match is started - it only reports what the player
 * clicked (see LobbyCallbacks). app/gameApp.ts decides what happens.
 */
import { DEFAULT_MAP_ID, isMapId, MAPS } from '../../shared/maps';
import { DEFAULT_DIFFICULTY, DIFFICULTIES, isDifficulty, type Difficulty } from '../../solo/difficulty';
import type { Settings } from '../app/settings';
import { TEXT } from './hudTexts';

const NAME_STORAGE_KEY = 'playerName';
const MAP_STORAGE_KEY = 'mapId';
const DIFFICULTY_STORAGE_KEY = 'difficulty';

function element<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id} in index.html`);
  return el as T;
}

/** Is a game server reachable? Without one only the solo mode works (e.g. on GitHub Pages). */
export type OnlineState = 'connecting' | 'online' | 'offline';

export interface LobbyCallbacks {
  onSolo: (name: string, mapId: string, difficulty: Difficulty) => void;
  onQuickMatch: (name: string) => void;
  onCreateRoom: (name: string, mapId: string) => void;
  onJoinRoom: (code: string, name: string) => void;
  /** The player wants to try the server connection again. */
  onRetryOnline: () => void;
  /** The player moved a settings slider. */
  onSettingsChange: (settings: Settings) => void;
  onOpenHelp: () => void;
}

export class LobbyUi {
  private readonly root = element('lobby');
  private readonly nameInput = element<HTMLInputElement>('name-input');
  private readonly codeInput = element<HTMLInputElement>('code-input');
  private readonly status = element('lobby-status');
  private readonly onlineStatus = element('online-status');
  private readonly retryButton = element<HTMLButtonElement>('retry-button');
  private selectedMap: string;
  private selectedDifficulty: Difficulty;

  constructor(settings: Settings, callbacks: LobbyCallbacks) {
    this.nameInput.value = localStorage.getItem(NAME_STORAGE_KEY) ?? '';
    const storedMap = localStorage.getItem(MAP_STORAGE_KEY);
    this.selectedMap = isMapId(storedMap) ? storedMap : DEFAULT_MAP_ID;
    const storedDifficulty = localStorage.getItem(DIFFICULTY_STORAGE_KEY);
    this.selectedDifficulty = isDifficulty(storedDifficulty) ? storedDifficulty : DEFAULT_DIFFICULTY;
    this.buildMapList();
    this.buildDifficultyList();

    element('solo-button').addEventListener('click', () => {
      callbacks.onSolo(this.playerName(), this.selectedMap, this.selectedDifficulty);
    });
    element('quick-button').addEventListener('click', () => {
      this.setStatus('Suche einen Gegner …');
      callbacks.onQuickMatch(this.playerName());
    });
    element('create-button').addEventListener('click', () => {
      this.setStatus('Erstelle Raum …');
      callbacks.onCreateRoom(this.playerName(), this.selectedMap);
    });
    const join = () => {
      const code = this.codeInput.value.trim().toUpperCase();
      if (code.length !== 4) return this.setStatus('Bitte den Raumcode mit 4 Zeichen eingeben.');
      this.setStatus(`Trete Raum ${code} bei …`);
      callbacks.onJoinRoom(code, this.playerName());
    };
    element('join-button').addEventListener('click', join);
    this.codeInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') join();
    });
    this.retryButton.addEventListener('click', callbacks.onRetryOnline);
    element('help-button').addEventListener('click', callbacks.onOpenHelp);

    // Settings sliders.
    const volume = element<HTMLInputElement>('volume-slider');
    const sensitivity = element<HTMLInputElement>('sensitivity-slider');
    volume.value = String(settings.volume);
    sensitivity.value = String(settings.sensitivity);
    const changed = () =>
      callbacks.onSettingsChange({ volume: Number(volume.value), sensitivity: Number(sensitivity.value) });
    volume.addEventListener('input', changed);
    sensitivity.addEventListener('input', changed);
  }

  /**
   * Enable the multiplayer buttons only while a game server is connected. Without a
   * server they are greyed out and a note explains why - the solo mode still works.
   */
  setOnlineState(state: OnlineState): void {
    const online = state === 'online';
    for (const id of ['quick-button', 'create-button', 'join-button', 'code-input']) {
      element<HTMLButtonElement | HTMLInputElement>(id).disabled = !online;
    }
    this.onlineStatus.textContent = online ? '' : state === 'connecting' ? TEXT.onlineConnecting : TEXT.onlineOffline;
    this.onlineStatus.classList.toggle('warning', state === 'offline');
    this.retryButton.classList.toggle('hidden', state !== 'offline');
    element('multiplayer').dataset.state = state;
  }

  /** One selectable card per registered map (name + description from the map data). */
  private buildMapList(): void {
    const list = element('map-list');
    for (const map of Object.values(MAPS)) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'map-card';
      card.dataset.map = map.id;
      const name = document.createElement('b');
      name.textContent = map.name;
      const description = document.createElement('span');
      description.textContent = map.description;
      card.append(name, description);
      card.addEventListener('click', () => {
        this.selectedMap = map.id;
        localStorage.setItem(MAP_STORAGE_KEY, map.id);
        this.markSelected();
      });
      list.append(card);
    }
    this.markSelected();
  }

  /** One button per difficulty level (labels from solo/difficulty.ts). */
  private buildDifficultyList(): void {
    const list = element('difficulty-list');
    for (const [id, level] of Object.entries(DIFFICULTIES)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.difficulty = id;
      button.textContent = level.label;
      button.addEventListener('click', () => {
        if (!isDifficulty(id)) return;
        this.selectedDifficulty = id;
        localStorage.setItem(DIFFICULTY_STORAGE_KEY, id);
        this.markSelected();
      });
      list.append(button);
    }
    this.markSelected();
  }

  private markSelected(): void {
    for (const card of element('map-list').querySelectorAll<HTMLElement>('.map-card')) {
      card.classList.toggle('selected', card.dataset.map === this.selectedMap);
    }
    for (const button of element('difficulty-list').querySelectorAll<HTMLElement>('button')) {
      button.classList.toggle('selected', button.dataset.difficulty === this.selectedDifficulty);
    }
    element('difficulty-description').textContent = DIFFICULTIES[this.selectedDifficulty].description;
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle('hidden', !visible);
  }

  setStatus(text: string): void {
    this.status.textContent = text;
  }

  private playerName(): string {
    const name = this.nameInput.value.trim() || 'Spieler';
    localStorage.setItem(NAME_STORAGE_KEY, name);
    return name;
  }
}
