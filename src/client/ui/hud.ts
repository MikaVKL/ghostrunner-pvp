/**
 * The in-game overlay (HP bars, score, timer, big messages). Plain HTML elements from
 * index.html, updated once per frame from the newest snapshot.
 */
import { TICK_RATE } from '../../shared/config';
import { MOVE } from '../../shared/movement/movementConfig';
import { MAX_HP } from '../../shared/sim/playerState';
import type { MatchState } from '../../shared/sim/world';
import type { GameClient } from '../../netcode/gameClient';

function element(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id} in index.html`);
  return el;
}

const seconds = (ticks: number) => Math.ceil(ticks / TICK_RATE);

export class Hud {
  private readonly root = element('hud');
  private readonly score = element('score');
  private readonly timer = element('timer');
  private readonly playerHp = element('player-hp');
  private readonly enemyHp = element('enemy-hp');
  private readonly enemyPanel = element('enemy-panel');
  private readonly enemyName = element('enemy-name');
  private readonly dashBar = element('dash-bar');
  private readonly message = element('message');
  private readonly hint = element('hint');
  private readonly roomCode = element('room-code');
  private readonly damageFlash = element('damage-flash');
  private toastText = '';
  private toastUntil = 0;

  setVisible(visible: boolean): void {
    this.root.classList.toggle('hidden', !visible);
  }

  /** Show a short message in the middle of the screen (e.g. "PARRIED!"). */
  toast(text: string, durationMs = 900): void {
    this.toastText = text;
    this.toastUntil = performance.now() + durationMs;
  }

  /** Red flash around the screen when taking damage. */
  flashDamage(): void {
    this.damageFlash.classList.add('active');
    requestAnimationFrame(() => requestAnimationFrame(() => this.damageFlash.classList.remove('active')));
  }

  update(client: GameClient, pointerLocked: boolean): void {
    const { room, snapshot, localPlayer: me } = client;
    if (!room || !snapshot || !me) return;
    const enemy = client.opponent;
    const match = snapshot.match;

    this.roomCode.textContent = room.code;
    this.hint.classList.toggle('hidden', pointerLocked);
    this.playerHp.style.width = `${(me.hp / MAX_HP) * 100}%`;
    this.dashBar.style.width = `${(1 - me.dashCooldown / MOVE.dashCooldownTicks) * 100}%`;

    this.enemyPanel.classList.toggle('hidden', !enemy);
    if (enemy) {
      this.enemyHp.style.width = `${(enemy.hp / MAX_HP) * 100}%`;
      this.enemyName.textContent = room.players.find((p) => p.slot === enemy.slot)?.name ?? 'Opponent';
    }

    const enemySlot = 1 - room.slot;
    this.score.textContent = match.phase === 'waiting' ? '' : `${match.scores[room.slot]} : ${match.scores[enemySlot]}`;
    this.timer.textContent = match.phase === 'playing' ? `${seconds(match.phaseTicksLeft)} s` : '';
    this.message.textContent = this.messageFor(match, room.slot, room.code);
  }

  private messageFor(match: MatchState, mySlot: number, code: string): string {
    const outcome = (winner: number, won: string, lost: string, draw: string) =>
      winner === mySlot ? won : winner === -1 ? draw : lost;
    switch (match.phase) {
      case 'waiting':
        return `Waiting for opponent\nRoom code: ${code}`;
      case 'countdown':
        return `Round ${match.round}\n${seconds(match.phaseTicksLeft)}`;
      case 'playing':
        return performance.now() < this.toastUntil ? this.toastText : '';
      case 'roundEnd':
        return outcome(match.roundWinner, 'Round won', 'Round lost', 'Draw');
      case 'paused':
        return `Gegner hat die Verbindung verloren\nWarte ${seconds(match.phaseTicksLeft)} s ...`;
      case 'matchEnd':
        return (
          outcome(match.matchWinner, 'VICTORY', 'DEFEAT', 'DRAW') +
          `\nRematch in ${seconds(match.phaseTicksLeft)}`
        );
    }
  }
}
