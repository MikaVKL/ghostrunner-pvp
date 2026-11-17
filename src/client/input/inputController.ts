/**
 * Turns keyboard and mouse events into one InputSample per tick.
 * The view direction (yaw/pitch) lives here: the mouse changes it instantly, the
 * simulation just receives it as part of the input.
 */
import { Button, MAX_PITCH, type InputSample } from '../../shared/input';
import { clamp, wrapAngle } from '../../shared/math/scalar';
import { ACTION_BUTTONS, DEFAULT_KEYMAP, MOUSE_SENSITIVITY, type Keymap } from './bindings';
import { actionFor } from './keymap';

export class InputController {
  yaw = 0;
  pitch = 0;
  /** Input is ignored while disabled (e.g. while the lobby is shown). */
  enabled = false;
  /** Multiplier on the mouse speed (from the settings in the menu). */
  sensitivity = 1;
  /** Aim assist setting: sent with every input as Button.AimAssist (the server decides hits). */
  aimAssist = true;
  /** The player's key bindings (menu "Tastenbelegung"). */
  keymap: Keymap = DEFAULT_KEYMAP;
  private readonly keysDown = new Set<string>();
  /** Buttons currently held. */
  private heldButtons = 0;
  /** Buttons pressed since the last sample - so a very short tap is never lost. */
  private latchedButtons = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.releaseAll);
    document.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  /** True while the mouse is captured by the game. */
  get pointerLocked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  setView(yaw: number, pitch: number): void {
    this.yaw = yaw;
    this.pitch = pitch;
  }

  /** The input for the current tick. Call exactly once per tick. */
  sample(): InputSample {
    const buttons = this.heldButtons | this.latchedButtons | (this.aimAssist ? Button.AimAssist : 0);
    this.latchedButtons = 0;
    if (!this.enabled) return { moveX: 0, moveZ: 0, yaw: this.yaw, pitch: this.pitch, buttons: 0 };
    return {
      moveX: this.axis(this.keymap.right, this.keymap.left),
      moveZ: this.axis(this.keymap.forward, this.keymap.back),
      yaw: this.yaw,
      pitch: this.pitch,
      buttons,
    };
  }

  private axis(positive: readonly string[], negative: readonly string[]): number {
    const isDown = (codes: readonly string[]) => codes.some((code) => code !== '' && this.keysDown.has(code));
    return (isDown(positive) ? 1 : 0) - (isDown(negative) ? 1 : 0);
  }

  private press(button: number): void {
    this.heldButtons |= button;
    this.latchedButtons |= button;
  }

  /** The game button bound to a key code or mouse button ("Mouse0"), or 0. */
  private buttonFor(code: string): number {
    const action = actionFor(this.keymap, code);
    return action ? (ACTION_BUTTONS[action] ?? 0) : 0;
  }

  private down(code: string): void {
    this.keysDown.add(code);
    const button = this.buttonFor(code);
    if (button) this.press(button);
  }

  private up(code: string): void {
    this.keysDown.delete(code);
    const button = this.buttonFor(code);
    // Another key bound to the same button may still be held.
    const stillHeld = [...this.keysDown].some((other) => this.buttonFor(other) === button);
    if (button && !stillHeld) this.heldButtons &= ~button;
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (!this.enabled) return;
    // Ctrl is the slide key: stop browser shortcuts like Ctrl+D (bookmark) or Ctrl+S.
    // Ctrl+W (close tab) cannot be stopped by a web page - gameApp.ts asks before leaving.
    if (event.ctrlKey) event.preventDefault();
    if (event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault();
    if (event.repeat) return;
    this.down(event.code);
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.up(event.code);
  };

  private onMouseDown = (event: MouseEvent): void => {
    if (!this.enabled) return;
    if (!this.pointerLocked) {
      // The first click only captures the mouse.
      void this.canvas.requestPointerLock();
      return;
    }
    this.down(`Mouse${event.button}`);
  };

  private onMouseUp = (event: MouseEvent): void => {
    this.up(`Mouse${event.button}`);
  };

  private onMouseMove = (event: MouseEvent): void => {
    if (!this.enabled || !this.pointerLocked) return;
    const speed = MOUSE_SENSITIVITY * this.sensitivity;
    this.yaw = wrapAngle(this.yaw - event.movementX * speed);
    this.pitch = clamp(this.pitch - event.movementY * speed, -MAX_PITCH, MAX_PITCH);
  };

  private releaseAll = (): void => {
    this.keysDown.clear();
    this.heldButtons = 0;
    this.latchedButtons = 0;
  };
}
