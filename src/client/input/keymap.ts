/**
 * The player's key bindings: load/save (localStorage), change one binding, and readable
 * key names for the menu. Pure functions except load/save, so they are unit tested.
 */
import { ACTIONS, DEFAULT_KEYMAP, UI_KEYS, type Action, type Keymap } from './bindings';

const STORAGE_KEY = 'keymap';

/** Keys that can never be bound: Escape frees the mouse, the UI keys have their own job. */
const RESERVED = new Set<string>(['Escape', ...Object.values(UI_KEYS)]);

export function isBindable(code: string): boolean {
  return code !== '' && !RESERVED.has(code);
}

function copyKeymap(map: Keymap): Keymap {
  return Object.fromEntries(ACTIONS.map((a) => [a, [...map[a]]])) as Keymap;
}

/** Read a stored keymap. Missing or broken entries fall back to the defaults. */
export function parseKeymap(raw: unknown): Keymap {
  const map = copyKeymap(DEFAULT_KEYMAP);
  if (typeof raw !== 'object' || raw === null) return map;
  const stored = raw as Record<string, unknown>;
  for (const action of ACTIONS) {
    const slots = stored[action];
    if (!Array.isArray(slots) || slots.length !== 2) continue;
    if (!slots.every((s) => typeof s === 'string' && (s === '' || isBindable(s)))) continue;
    map[action] = [slots[0] as string, slots[1] as string];
  }
  return map;
}

/**
 * Bind `code` to one slot of `action`. A key does exactly one thing: if another action
 * (or the other slot) used it, it is removed there. Returns a new keymap.
 */
export function bind(map: Keymap, action: Action, slot: 0 | 1, code: string): Keymap {
  const next = copyKeymap(map);
  if (code !== '' && !isBindable(code)) return next;
  if (code !== '') {
    for (const other of ACTIONS) next[other] = next[other].map((c) => (c === code ? '' : c)) as [string, string];
  }
  next[action][slot] = code;
  return next;
}

/** Which action does this key or mouse button trigger? */
export function actionFor(map: Keymap, code: string): Action | null {
  if (code === '') return null;
  return ACTIONS.find((a) => map[a].includes(code)) ?? null;
}

const SPECIAL_NAMES: Record<string, string> = {
  Mouse0: 'Maus links',
  Mouse1: 'Maus Mitte',
  Mouse2: 'Maus rechts',
  Space: 'Leertaste',
  ShiftLeft: 'Shift links',
  ShiftRight: 'Shift rechts',
  ControlLeft: 'Strg links',
  ControlRight: 'Strg rechts',
  AltLeft: 'Alt links',
  AltRight: 'Alt rechts',
  ArrowUp: 'Pfeil hoch',
  ArrowDown: 'Pfeil runter',
  ArrowLeft: 'Pfeil links',
  ArrowRight: 'Pfeil rechts',
  Tab: 'Tab',
  CapsLock: 'Feststell',
  Enter: 'Enter',
  Backspace: 'Rück',
};

/** Short, readable German name of a key code ("KeyQ" -> "Q"). */
export function keyLabel(code: string): string {
  if (code === '') return '–';
  if (SPECIAL_NAMES[code]) return SPECIAL_NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  if (code.startsWith('Mouse')) return `Maus ${Number(code.slice(5)) + 1}`;
  return code;
}

/** The label of the first bound slot of an action (for the HUD, e.g. "Q"). */
export function primaryLabel(map: Keymap, action: Action): string {
  return keyLabel(map[action].find((c) => c !== '') ?? '');
}

export function loadKeymap(): Keymap {
  try {
    return parseKeymap(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'));
  } catch {
    return copyKeymap(DEFAULT_KEYMAP);
  }
}

export function saveKeymap(map: Keymap): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}
