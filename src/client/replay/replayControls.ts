/**
 * The control bar of the replay viewer (HTML in index.html, #replay). Shows the time,
 * speed and camera, and reports clicks to the viewer. It only displays - the logic is in
 * replayViewer.ts and shared/replay/replayPlayback.ts.
 */
import { TICK_RATE } from '../../shared/config';
import type { ReplayPlayback } from '../../shared/replay/replayPlayback';

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id} in index.html`);
  return el as T;
}

export interface ControlCallbacks {
  togglePause: () => void;
  seekBySeconds: (seconds: number) => void;
  seekToFraction: (fraction: number) => void;
  changeSpeed: (direction: 1 | -1) => void;
  nextCamera: () => void;
  exportFile: () => void;
  close: () => void;
}

const seconds = (ticks: number) => (ticks / TICK_RATE).toFixed(1);

export class ReplayControls {
  private readonly root = element('replay');
  private readonly slider = element<HTMLInputElement>('replay-slider');
  private dragging = false;

  constructor(callbacks: ControlCallbacks) {
    const on = (id: string, action: () => void) =>
      element(id).addEventListener('click', (event) => {
        event.stopPropagation();
        action();
      });
    on('replay-play', callbacks.togglePause);
    on('replay-back', () => callbacks.seekBySeconds(-5));
    on('replay-forward', () => callbacks.seekBySeconds(5));
    on('replay-slower', () => callbacks.changeSpeed(-1));
    on('replay-faster', () => callbacks.changeSpeed(1));
    on('replay-camera', callbacks.nextCamera);
    on('replay-export', callbacks.exportFile);
    on('replay-close', callbacks.close);
    this.slider.addEventListener('input', () => {
      this.dragging = true;
      callbacks.seekToFraction(Number(this.slider.value) / Number(this.slider.max));
    });
    this.slider.addEventListener('change', () => (this.dragging = false));
  }

  show(title: string, killcam: boolean): void {
    this.root.classList.remove('hidden');
    this.root.classList.toggle('killcam', killcam);
    element('replay-title').textContent = killcam ? 'KILLCAM' : `Replay · ${title}`;
    element('replay-check').textContent = '';
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  update(playback: ReplayPlayback, cameraLabel: string, check: string): void {
    const { sim } = playback;
    const length = sim.lastTick - sim.firstTick;
    const done = playback.tick - sim.firstTick;
    element('replay-time').textContent = `${seconds(done)} / ${seconds(length)} s`;
    element('replay-play').textContent = playback.playing ? 'Pause (P)' : 'Abspielen (P)';
    element('replay-speed').textContent = `${playback.speed}×`;
    element('replay-camera').textContent = `${cameraLabel} (C)`;
    element('replay-check').textContent = check;
    if (!this.dragging) this.slider.value = String(length > 0 ? Math.round((done / length) * Number(this.slider.max)) : 0);
  }
}
