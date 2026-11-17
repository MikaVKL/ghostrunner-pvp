/**
 * Instant hit feedback: notices the moment the local player's swing REACHES the enemy as
 * it is shown on screen. That is exactly what the server checks too (lag compensation
 * uses the position the attacker saw), so the spark appears without waiting ~100 ms for
 * the server.
 *
 * It is only a spark and a sound. Whether the swing really kills (or was parried, or
 * clashed) is decided by the server; the kill effects wait for its `hit` event.
 */
import { currentAttack, isAttackActive } from '../../shared/combat/actions';
import { isInMeleeRange } from '../../shared/combat/hitDetection';
import type { PlayerState } from '../../shared/sim/playerState';

export class ContactWatcher {
  /** True once the current swing has shown its spark (one spark per swing). */
  private reported = false;
  private lastActionTicks = -1;

  /**
   * Call once per frame. Returns the enemy the swing just reached, or null.
   * @param aimAssist the player's aim assist setting (the same wider cone the server uses)
   */
  check(me: PlayerState, shownEnemies: PlayerState[], aimAssist = false): PlayerState | null {
    if (!me.alive || me.action !== 'attack') {
      this.reported = false;
      this.lastActionTicks = -1;
      return null;
    }
    if (me.actionTicks < this.lastActionTicks) this.reported = false; // the next swing began
    this.lastActionTicks = me.actionTicks;
    if (this.reported || !isAttackActive(me)) return null;
    for (const enemy of shownEnemies) {
      if (!enemy.alive || enemy.invulnerableTicks > 0) continue;
      if (!isInMeleeRange(me, enemy, currentAttack(me), enemy.pos, aimAssist)) continue;
      this.reported = true;
      return enemy;
    }
    return null;
  }
}
