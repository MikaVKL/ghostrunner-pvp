/** German HUD texts that depend on the game state. */
import { describe, expect, it } from 'vitest';
import { livesText } from '../../src/client/ui/hudTexts';

describe('lives display', () => {
  it('shows filled and empty hearts in modes with several lives', () => {
    expect(livesText(3, 3)).toBe('♥♥♥');
    expect(livesText(1, 3)).toBe('♥♡♡');
    expect(livesText(0, 3)).toBe('♡♡♡');
  });

  it('shows nothing in the duel (one life: a hit simply kills)', () => {
    expect(livesText(1, 1)).toBe('');
  });

  it('never shows more hearts than lives, even with odd values', () => {
    expect(livesText(5, 3)).toBe('♥♥♥');
    expect(livesText(-1, 3)).toBe('♡♡♡');
  });
});
