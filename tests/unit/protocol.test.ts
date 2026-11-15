import { describe, expect, it } from 'vitest';
import { ALL_BUTTONS, MAX_PITCH, sanitizeInput } from '../../src/shared/input';
import {
  encodeMessage,
  MAX_CLIENT_MESSAGE_LENGTH,
  parseClientMessage,
  parseServerMessage,
  sanitizeName,
} from '../../src/shared/protocol/codec';

describe('sanitizeInput', () => {
  it('accepts a normal input unchanged', () => {
    const cmd = { seq: 3, moveX: 1, moveZ: -1, yaw: 0.5, pitch: -0.2, buttons: 5 };
    expect(sanitizeInput(cmd)).toEqual(cmd);
  });

  it('clamps cheated values into the legal range', () => {
    const cmd = sanitizeInput({ seq: 1, moveX: 50, moveZ: -9.7, yaw: 100, pitch: 9, buttons: 0xffff });
    expect(cmd).not.toBeNull();
    expect(cmd!.moveX).toBe(1);
    expect(cmd!.moveZ).toBe(-1);
    expect(Math.abs(cmd!.yaw)).toBeLessThanOrEqual(Math.PI);
    expect(cmd!.pitch).toBe(MAX_PITCH);
    expect(cmd!.buttons).toBe(ALL_BUTTONS);
  });

  it('rejects malformed inputs', () => {
    expect(sanitizeInput(null)).toBeNull();
    expect(sanitizeInput('hello')).toBeNull();
    expect(sanitizeInput({ seq: 1 })).toBeNull();
    expect(sanitizeInput({ seq: 1, moveX: NaN, moveZ: 0, yaw: 0, pitch: 0, buttons: 0 })).toBeNull();
    expect(sanitizeInput({ seq: 1, moveX: 0, moveZ: 0, yaw: Infinity, pitch: 0, buttons: 0 })).toBeNull();
    expect(sanitizeInput({ seq: 0, moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons: 0 })).toBeNull();
    expect(sanitizeInput({ seq: 1.5, moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons: 0 })).toBeNull();
  });

  it('drops unknown extra fields (a client cannot smuggle in a position)', () => {
    const cmd = sanitizeInput({ seq: 1, moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons: 0, pos: { x: 99 } });
    expect(cmd).not.toHaveProperty('pos');
  });
});

describe('parseClientMessage', () => {
  it('parses every valid message type', () => {
    expect(parseClientMessage('{"type":"createRoom","name":"Mika"}')).toEqual({ type: 'createRoom', name: 'Mika' });
    expect(parseClientMessage('{"type":"quickMatch","name":"Mika"}')).toEqual({ type: 'quickMatch', name: 'Mika' });
    expect(parseClientMessage('{"type":"joinRoom","code":"abcd","name":"X"}')).toEqual({
      type: 'joinRoom',
      code: 'ABCD',
      name: 'X',
    });
    expect(parseClientMessage('{"type":"leaveRoom"}')).toEqual({ type: 'leaveRoom' });
    expect(parseClientMessage('{"type":"rematch"}')).toEqual({ type: 'rematch' });
    expect(parseClientMessage('{"type":"ping","t":12}')).toEqual({ type: 'ping', t: 12 });
    const inputMessage = { type: 'input' as const, cmd: { seq: 1, moveX: 0, moveZ: 1, yaw: 0, pitch: 0, buttons: 0 } };
    expect(parseClientMessage(encodeMessage(inputMessage))).toEqual(inputMessage);
  });

  it('rejects garbage', () => {
    const bad = [
      '',
      'not json',
      'null',
      '42',
      '[]',
      '{}',
      '{"type":"unknown"}',
      '{"type":"joinRoom","code":"AB"}',
      '{"type":"joinRoom","code":"AB!?"}',
      '{"type":"joinRoom","code":12}',
      '{"type":"input"}',
      '{"type":"input","cmd":{"seq":"1"}}',
      '{"type":"ping","t":"now"}',
      '{"type":"createRoom","name":"' + 'x'.repeat(MAX_CLIENT_MESSAGE_LENGTH) + '"}',
    ];
    for (const text of bad) expect(parseClientMessage(text), text).toBeNull();
  });
});

describe('names and server messages', () => {
  it('sanitizeName strips odd characters and limits the length', () => {
    expect(sanitizeName('  Mika  ')).toBe('Mika');
    expect(sanitizeName('<script>alert(1)</script>')).toBe('scriptalert1scri');
    expect(sanitizeName('')).toBe('Player');
    expect(sanitizeName(42)).toBe('Player');
    expect(sanitizeName('Jürgen Müller')).toBe('Jürgen Müller');
  });

  it('parseServerMessage returns null for invalid text', () => {
    expect(parseServerMessage('nope')).toBeNull();
    expect(parseServerMessage('{"type":"pong","t":1}')).toEqual({ type: 'pong', t: 1 });
  });
});
