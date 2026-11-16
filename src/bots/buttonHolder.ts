/**
 * Bots "press" a button by holding it for a few ticks, like a finger would.
 * This class remembers which buttons are held and for how long.
 */
import { Button } from '../shared/input';

export class ButtonHolder {
  /** Buttons that are being held, with the number of ticks left. */
  private held = new Map<number, number>();

  /** Hold the given buttons (bit flags) for a few ticks. */
  press(buttons: number, ticks = 3): void {
    for (const button of Object.values(Button)) {
      if (buttons & button) this.held.set(button, ticks);
    }
  }

  /** All currently held buttons as bit flags. Call exactly once per tick (counts the timers down). */
  current(): number {
    let buttons = 0;
    for (const [button, left] of this.held) {
      buttons |= button;
      if (left <= 1) this.held.delete(button);
      else this.held.set(button, left - 1);
    }
    return buttons;
  }
}
