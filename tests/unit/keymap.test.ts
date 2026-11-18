/**
 * Key bindings (menu "Tastenbelegung"): defaults, rebinding without double use, storage.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_KEYMAP } from '../../src/client/input/bindings';
import { actionFor, bind, keyLabel, parseKeymap, primaryLabel } from '../../src/client/input/keymap';

describe('key bindings', () => {
  it('the defaults follow the owner\'s controls', () => {
    expect(actionFor(DEFAULT_KEYMAP, 'Mouse0')).toBe('attack');
    expect(actionFor(DEFAULT_KEYMAP, 'KeyQ')).toBe('parry');
    expect(actionFor(DEFAULT_KEYMAP, 'ShiftLeft')).toBe('dash');
    expect(actionFor(DEFAULT_KEYMAP, 'Space')).toBe('jump');
    expect(actionFor(DEFAULT_KEYMAP, 'KeyC')).toBe('crouch');
    expect(actionFor(DEFAULT_KEYMAP, 'KeyV')).toBe('walk');
    expect(actionFor(DEFAULT_KEYMAP, 'ControlLeft')).toBeNull(); // Ctrl+W would close the tab
    expect(actionFor(DEFAULT_KEYMAP, 'KeyW')).toBe('forward');
  });

  it('a key does exactly one thing: binding it elsewhere frees its old place', () => {
    const map = bind(DEFAULT_KEYMAP, 'dash', 0, 'KeyQ');
    expect(map.dash[0]).toBe('KeyQ');
    expect(map.parry).toEqual(['', 'Mouse2']);
    expect(actionFor(map, 'KeyQ')).toBe('dash');
    expect(DEFAULT_KEYMAP.parry[0]).toBe('KeyQ'); // the defaults are not changed
  });

  it('Escape and the menu keys (R, M, H, B) cannot be bound', () => {
    expect(bind(DEFAULT_KEYMAP, 'jump', 1, 'Escape').jump[1]).toBe('');
    expect(bind(DEFAULT_KEYMAP, 'jump', 1, 'KeyR').jump[1]).toBe('');
  });

  it('stored bindings are read back, broken ones fall back to the defaults', () => {
    const changed = bind(DEFAULT_KEYMAP, 'attack', 1, 'KeyK');
    expect(parseKeymap(JSON.parse(JSON.stringify(changed)))).toEqual(changed);
    expect(parseKeymap({ attack: 'KeyK', jump: ['Escape', ''] })).toEqual(DEFAULT_KEYMAP);
    expect(parseKeymap(null)).toEqual(DEFAULT_KEYMAP);
  });

  it('shows readable German key names', () => {
    expect(keyLabel('KeyQ')).toBe('Q');
    expect(keyLabel('Mouse0')).toBe('Maus links');
    expect(keyLabel('ControlLeft')).toBe('Strg links');
    expect(keyLabel('Space')).toBe('Leertaste');
    expect(keyLabel('')).toBe('–');
    expect(primaryLabel(bind(DEFAULT_KEYMAP, 'parry', 0, ''), 'parry')).toBe('Maus rechts');
  });
});
