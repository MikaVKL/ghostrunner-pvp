/**
 * The start screen: enter a name, create a room, join by code or quick match.
 */
import type { GameClient } from '../../netcode/gameClient';

const NAME_STORAGE_KEY = 'playerName';

function element<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id} in index.html`);
  return el as T;
}

export class LobbyUi {
  private readonly root = element('lobby');
  private readonly nameInput = element<HTMLInputElement>('name-input');
  private readonly codeInput = element<HTMLInputElement>('code-input');
  private readonly status = element('lobby-status');

  constructor(client: GameClient) {
    this.nameInput.value = localStorage.getItem(NAME_STORAGE_KEY) ?? '';

    element('create-button').addEventListener('click', () => {
      this.setStatus('Creating room ...');
      client.createRoom(this.playerName());
    });
    element('quick-button').addEventListener('click', () => {
      this.setStatus('Searching for a match ...');
      client.quickMatch(this.playerName());
    });
    const join = () => {
      const code = this.codeInput.value.trim().toUpperCase();
      if (code.length !== 4) return this.setStatus('Please enter the 4-character room code.');
      this.setStatus(`Joining room ${code} ...`);
      client.joinRoom(code, this.playerName());
    };
    element('join-button').addEventListener('click', join);
    this.codeInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') join();
    });
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle('hidden', !visible);
  }

  setStatus(text: string): void {
    this.status.textContent = text;
  }

  private playerName(): string {
    const name = this.nameInput.value.trim() || 'Player';
    localStorage.setItem(NAME_STORAGE_KEY, name);
    return name;
  }
}
