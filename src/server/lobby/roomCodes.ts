/**
 * Room codes: short, easy to read aloud, no look-alike characters (no O/0, I/1).
 */
import { ROOM_CODE_LENGTH } from '../../shared/protocol/codec';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRoomCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ALPHABET[Math.floor(random() * ALPHABET.length)];
  }
  return code;
}

/** Generate a code that is not in use yet. */
export function generateUniqueRoomCode(
  isTaken: (code: string) => boolean,
  random: () => number = Math.random,
): string {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const code = generateRoomCode(random);
    if (!isTaken(code)) return code;
  }
  throw new Error('Could not find a free room code');
}
