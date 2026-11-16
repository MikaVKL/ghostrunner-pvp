/**
 * The main menu: enter a name, quick match, create a room on a chosen map, join by code,
 * open the controls help, change the settings.
 */
import { DEFAULT_MAP_ID, isMapId, MAPS } from '../../shared/maps';
import type { GameClient } from '../../netcode/gameClient';
import type { Settings } from '../app/settings';

const NAME_STORAGE_KEY = 'playerName';
const MAP_STORAGE_KEY = 'mapId';

function element<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id} in index.html`);
  return el as T;
}

export interface LobbyCallbacks {
  /** The player moved a settings slider. */
  onSettingsChange: (settings: Settings) => void;
  onOpenHelp: () => void;
}

export class LobbyUi {
  private readonly root = element('lobby');
  private readonly nameInput = element<HTMLInputElement>('name-input');
  private readonly codeInput = element<HTMLInputElement>('code-input');
  private readonly status = element('lobby-status');
  private selectedMap: string;

  constructor(client: GameClient, settings: Settings, callbacks: LobbyCallbacks) {
    this.nameInput.value = localStorage.getItem(NAME_STORAGE_KEY) ?? '';
    const storedMap = localStorage.getItem(MAP_STORAGE_KEY);
    this.selectedMap = isMapId(storedMap) ? storedMap : DEFAULT_MAP_ID;
    this.buildMapList();

    element('quick-button').addEventListener('click', () => {
      this.setStatus('Suche einen Gegner …');
      client.quickMatch(this.playerName());
    });
    element('create-button').addEventListener('click', () => {
      this.setStatus('Erstelle Raum …');
      client.createRoom(this.playerName(), this.selectedMap);
    });
    const join = () => {
      const code = this.codeInput.value.trim().toUpperCase();
      if (code.length !== 4) return this.setStatus('Bitte den Raumcode mit 4 Zeichen eingeben.');
      this.setStatus(`Trete Raum ${code} bei …`);
      client.joinRoom(code, this.playerName());
    };
    element('join-button').addEventListener('click', join);
    this.codeInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') join();
    });
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
        this.markSelectedMap();
      });
      list.append(card);
    }
    this.markSelectedMap();
  }

  private markSelectedMap(): void {
    for (const card of element('map-list').querySelectorAll<HTMLElement>('.map-card')) {
      card.classList.toggle('selected', card.dataset.map === this.selectedMap);
    }
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
