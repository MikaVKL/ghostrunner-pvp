/**
 * Menu section "Tastenbelegung": one row per action with two slots. Click a slot, then
 * press a key or mouse button to bind it; Esc empties the slot. "Standard" restores the
 * defaults. The result is saved in the browser (keymap.ts).
 */
import { ACTION_LABELS, ACTIONS, DEFAULT_KEYMAP, type Action, type Keymap } from '../input/bindings';
import { bind, isBindable, keyLabel } from '../input/keymap';

const LISTENING_TEXT = 'Taste drücken …';

export class KeymapUi {
  private keymap: Keymap;
  /** The slot waiting for a key, or null. */
  private listening: { action: Action; slot: 0 | 1; button: HTMLButtonElement } | null = null;
  private readonly slots = new Map<string, HTMLButtonElement>();

  constructor(
    private readonly list: HTMLElement,
    resetButton: HTMLElement,
    initial: Keymap,
    private readonly onChange: (keymap: Keymap) => void,
  ) {
    this.keymap = initial;
    for (const action of ACTIONS) this.addRow(action);
    resetButton.addEventListener('click', () => this.set(DEFAULT_KEYMAP));
    // Capture phase: the key must not also do something else (e.g. close the menu).
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('mousedown', this.onMouse, true);
    this.render();
  }

  private addRow(action: Action): void {
    const row = document.createElement('div');
    row.className = 'keymap-row';
    const name = document.createElement('span');
    name.textContent = ACTION_LABELS[action];
    row.append(name);
    for (const slot of [0, 1] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'keymap-slot';
      button.dataset.action = action;
      button.dataset.slot = String(slot);
      button.addEventListener('click', () => {
        this.listening = { action, slot, button };
        this.render();
      });
      this.slots.set(`${action}:${slot}`, button);
      row.append(button);
    }
    this.list.append(row);
  }

  private set(keymap: Keymap): void {
    this.keymap = keymap;
    this.listening = null;
    this.render();
    this.onChange(keymap);
  }

  private finish(code: string): void {
    if (!this.listening) return;
    const { action, slot } = this.listening;
    this.set(bind(this.keymap, action, slot, code));
  }

  private onKey = (event: KeyboardEvent): void => {
    if (!this.listening) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.code === 'Escape') this.finish('');
    else if (isBindable(event.code)) this.finish(event.code);
  };

  private onMouse = (event: MouseEvent): void => {
    if (!this.listening) return;
    // A click on the waiting slot itself binds that mouse button too (left click = attack).
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.button === 2) window.addEventListener('contextmenu', (e) => e.preventDefault(), { once: true });
    this.finish(`Mouse${event.button}`);
  };

  private render(): void {
    for (const action of ACTIONS) {
      for (const slot of [0, 1] as const) {
        const button = this.slots.get(`${action}:${slot}`)!;
        const waiting = this.listening?.action === action && this.listening.slot === slot;
        button.textContent = waiting ? LISTENING_TEXT : keyLabel(this.keymap[action][slot]);
        button.classList.toggle('listening', waiting);
      }
    }
  }
}
