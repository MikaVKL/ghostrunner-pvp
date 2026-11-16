/**
 * The in-game overlay: score, round timer, ability cooldowns, big messages and screen
 * flashes. Plain HTML elements from index.html, updated once per frame. It only READS
 * the game state. All texts are in hudTexts.ts.
 */
import { getWeapon } from '../../shared/combat/weapons';
import { COMBAT } from '../../shared/combat/combatConfig';
import { getMap } from '../../shared/maps';
import { MOVE } from '../../shared/movement/movementConfig';
import type { PlayerState } from '../../shared/sim/playerState';
import type { GameClient } from '../../netcode/gameClient';
import { teamColor } from '../render/palette';
import { centerMessage, secondsLeft, TEXT } from './hudTexts';

function element(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id} in index.html`);
  return el;
}

export type FlashKind = 'damage' | 'parry';

/** "◆◆◇" for 2 of 3 round wins. */
function pips(wins: number, needed: number): string {
  return '◆'.repeat(Math.min(wins, needed)) + '◇'.repeat(Math.max(0, needed - wins));
}

export class Hud {
  private readonly root = element('hud');
  private readonly myName = element('my-name');
  private readonly myPips = element('my-pips');
  private readonly enemyName = element('enemy-name');
  private readonly enemyPips = element('enemy-pips');
  private readonly roundLabel = element('round-label');
  private readonly timer = element('timer');
  private readonly message = element('message');
  private readonly subMessage = element('sub-message');
  private readonly attackBar = element('attack-bar');
  private readonly parryBar = element('parry-bar');
  private readonly dashBar = element('dash-bar');
  private readonly hint = element('hint');
  private readonly roomCode = element('room-code');
  private readonly mapName = element('map-name');
  private readonly ping = element('ping');
  private readonly flashEl = element('flash');
  private readonly connectionLost = element('connection-lost');
  private toastText = '';
  private toastUntil = 0;

  setVisible(visible: boolean): void {
    this.root.classList.toggle('hidden', !visible);
    if (!visible) document.body.classList.remove('dead', 'stunned');
  }

  /** Show a short message in the middle of the screen (e.g. "PARIERT!"). */
  toast(text: string, durationMs = 900): void {
    this.toastText = text;
    this.toastUntil = performance.now() + durationMs;
  }

  /** A short colored flash over the whole screen. */
  flash(kind: FlashKind): void {
    this.flashEl.className = '';
    void this.flashEl.offsetWidth; // restart the CSS animation
    this.flashEl.className = `flash-${kind}`;
  }

  /** Banner while our own connection is broken and we try to get it back. */
  setConnectionLost(lost: boolean): void {
    this.connectionLost.classList.toggle('hidden', !lost);
  }

  update(client: GameClient, pointerLocked: boolean): void {
    const { room, snapshot, localPlayer: me } = client;
    if (!room || !snapshot || !me) return;
    const match = snapshot.match;
    const enemySlot = 1 - room.slot;
    const enemyInfo = room.players.find((p) => p.slot === enemySlot);
    const inMatch = match.phase !== 'waiting';

    // Names and score pips glow in the same color as the fighters in the world.
    const css = (slot: number) => `#${teamColor(slot).toString(16).padStart(6, '0')}`;
    this.root.style.setProperty('--me', css(room.slot));
    this.root.style.setProperty('--enemy', css(enemySlot));

    this.roomCode.textContent = room.code;
    this.mapName.textContent = getMap(room.mapId).name;
    this.ping.textContent = `${client.stats.rttMs.toFixed(0)} ms`;
    this.hint.classList.toggle('hidden', pointerLocked);

    this.myName.textContent = room.players.find((p) => p.slot === room.slot)?.name ?? '';
    this.enemyName.textContent = enemyInfo ? enemyInfo.name + (enemyInfo.connected ? '' : ' (getrennt)') : '';
    this.myPips.textContent = inMatch ? pips(match.scores[room.slot], room.roundsToWin) : '';
    this.enemyPips.textContent = inMatch ? pips(match.scores[enemySlot], room.roundsToWin) : '';
    this.roundLabel.textContent = inMatch ? `Runde ${match.round}` : 'Übungsmodus';
    const playing = match.phase === 'playing';
    this.timer.textContent = playing ? String(secondsLeft(match.phaseTicksLeft)) : '';
    this.timer.classList.toggle('low', playing && secondsLeft(match.phaseTicksLeft) <= 10);

    const toast = performance.now() < this.toastUntil ? this.toastText : '';
    const center = centerMessage(match, room.slot, room.code, toast);
    this.message.textContent = center.main;
    this.subMessage.textContent = center.sub;
    this.message.classList.toggle('countdown', match.phase === 'countdown');

    this.updateAbilities(me);
    document.body.classList.toggle('dead', !me.alive);
    document.body.classList.toggle('stunned', me.alive && me.action === 'stunned');
  }

  /** Cooldown bars: full = ready. */
  private updateAbilities(me: PlayerState): void {
    const weapon = getWeapon(me.weaponId);
    const busy = me.action !== 'idle';
    const set = (bar: HTMLElement, ready: number) => {
      bar.style.width = `${Math.max(0, Math.min(1, ready)) * 100}%`;
      bar.parentElement!.parentElement!.classList.toggle('ready', ready >= 1);
    };
    set(this.attackBar, busy ? 0 : 1 - me.attackCooldown / weapon.cooldownTicks);
    set(this.parryBar, busy ? 0 : 1 - me.parryCooldown / COMBAT.parryCooldownTicks);
    set(this.dashBar, me.action === 'stunned' ? 0 : 1 - me.dashCooldown / MOVE.dashCooldownTicks);
  }
}

export { TEXT };
