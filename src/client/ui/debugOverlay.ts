/**
 * Developer overlay with network and physics numbers. Toggle with F3 (or the ` key).
 * `desyncs` must always be 0 - see LEARNING.md.
 */
import type { GameClient } from '../../netcode/gameClient';

export class DebugOverlay {
  private readonly el = document.getElementById('debug')!;
  private visible = false;
  private frames = 0;
  private fps = 0;
  private lastFpsAt = performance.now();

  constructor(private readonly extraInfo: string) {
    window.addEventListener('keydown', (event) => {
      if (event.code !== 'F3' && event.code !== 'Backquote') return;
      event.preventDefault();
      this.visible = !this.visible;
      this.el.classList.toggle('hidden', !this.visible);
    });
  }

  update(client: GameClient): void {
    this.frames++;
    const now = performance.now();
    if (now - this.lastFpsAt >= 500) {
      this.fps = (this.frames * 1000) / (now - this.lastFpsAt);
      this.frames = 0;
      this.lastFpsAt = now;
    }
    if (!this.visible) return;

    const me = client.localPlayer;
    const stats = client.stats;
    const f = (n: number) => n.toFixed(2);
    const lines = [
      `fps          ${this.fps.toFixed(0)}`,
      `ping         ${stats.rttMs.toFixed(0)} ms   ${this.extraInfo}`,
      `server tick  ${client.snapshot?.tick ?? '-'}   snapshots ${stats.snapshots}`,
      `pending in.  ${stats.pendingInputs}`,
      `corrections  ${stats.corrections}   (max ${stats.maxCorrection.toFixed(3)} m, teleports ${stats.teleports})`,
      `desyncs      ${stats.desyncs}${stats.desyncs > 0 ? '   <-- BUG: ' + stats.desyncDetails[0] : ''}`,
    ];
    if (me) {
      lines.push(
        `pos          ${f(me.pos.x)}  ${f(me.pos.y)}  ${f(me.pos.z)}`,
        `speed        ${f(Math.hypot(me.vel.x, me.vel.z))} m/s   vy ${f(me.vel.y)}`,
        `state        ${me.grounded ? 'ground' : 'air'}${me.wallRunning ? ' wallrun' : ''}${me.dashTicks > 0 ? ' dash' : ''}  action ${me.action}`,
      );
    }
    this.el.textContent = lines.join('\n');
  }
}
