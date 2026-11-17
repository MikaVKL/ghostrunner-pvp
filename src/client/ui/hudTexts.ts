/**
 * All German texts of the in-game overlay in one place. Change wording here.
 */
import { TICK_RATE } from '../../shared/config';
import type { ErrorCode } from '../../shared/protocol/messages';
import type { MatchState } from '../../shared/sim/world';

export const TEXT = {
  fight: 'KÄMPFT!',
  hit: 'TREFFER!',
  parried: 'PARIERT! Jetzt zuschlagen!',
  gotParried: 'GEPARIERT – du bist betäubt!',
  clash: 'KLINGEN-CLASH!',
  fell: 'Abgestürzt!',
  enemyFell: 'Gegner abgestürzt!',
  soundOff: 'Ton aus',
  soundOn: 'Ton an',
  opponent: 'Gegner',
  connectionLost: 'Verbindung verloren – verbinde neu …',
  connectionGaveUp: 'Der Server ist nicht erreichbar. Bitte lade die Seite neu.',
  restoringSeat: 'Kehre ins laufende Spiel zurück …',
  replayInvalid: 'Diese Datei ist kein Neonklinge-Replay.',
  onlineConnecting: 'Verbinde mit dem Spielserver …',
  onlineOffline:
    'Kein Spielserver erreichbar – Mehrspieler ist hier nicht verfügbar. „Solo gegen Bot“ funktioniert trotzdem.',
  clickToPlay: 'Klicke ins Spiel, um die Maus zu fangen · H = Steuerung',
};

/** Whole seconds left, rounded up (so a countdown shows 3, 2, 1). */
export const secondsLeft = (ticks: number) => Math.ceil(ticks / TICK_RATE);

/** German text for an error code from the server. */
export function errorText(code: ErrorCode): string {
  switch (code) {
    case 'room_not_found':
      return 'Diesen Raum gibt es nicht. Stimmt der Code?';
    case 'room_full':
      return 'Der Raum ist schon voll.';
    case 'already_in_room':
      return 'Du bist bereits in einem Raum.';
    case 'rejoin_failed':
      return 'Dein Platz im Spiel ist nicht mehr frei.';
    case 'bad_message':
      return 'Der Server hat eine Nachricht nicht verstanden.';
  }
}

export interface CenterMessage {
  /** Big text in the middle of the screen. */
  main: string;
  /** Smaller text below it. */
  sub: string;
}

function outcome(winner: number, mySlot: number, won: string, lost: string, draw: string): string {
  return winner === mySlot ? won : winner === -1 ? draw : lost;
}

function rematchHint(match: MatchState, mySlot: number): string {
  const iVoted = match.rematchVotes[mySlot] === true;
  const enemyVoted = match.rematchVotes[1 - mySlot] === true;
  const auto = match.phaseTicksLeft > 0 ? ` (automatisch in ${secondsLeft(match.phaseTicksLeft)} s)` : '';
  if (iVoted) return `Warte auf deinen Gegner …${auto}`;
  if (enemyVoted) return `Dein Gegner will ein Rematch – drücke R${auto}`;
  return `Drücke R für ein Rematch${auto}`;
}

/** What to show in the middle of the screen. `toast` is the current short message, if any. */
export function centerMessage(match: MatchState, mySlot: number, roomCode: string, toast: string): CenterMessage {
  const score = `${match.scores[mySlot]} : ${match.scores[1 - mySlot]}`;
  switch (match.phase) {
    case 'waiting':
      return {
        main: toast || 'Warte auf Gegner',
        sub: `Raumcode ${roomCode} – gib ihn deinem Gegner. Bis dahin kannst du frei üben.`,
      };
    case 'countdown':
      return { main: String(secondsLeft(match.phaseTicksLeft)), sub: `Runde ${match.round}` };
    case 'playing':
      return { main: toast, sub: '' };
    case 'roundEnd':
      return {
        main: outcome(match.roundWinner, mySlot, 'Runde gewonnen', 'Runde verloren', 'Unentschieden'),
        sub: score,
      };
    case 'matchEnd':
      return {
        main: outcome(match.matchWinner, mySlot, 'SIEG', 'NIEDERLAGE', 'UNENTSCHIEDEN'),
        sub: `${score} · ${rematchHint(match, mySlot)}`,
      };
    case 'paused':
      return {
        main: 'Pause',
        sub: `Dein Gegner hat die Verbindung verloren. Warte noch ${secondsLeft(match.phaseTicksLeft)} s …`,
      };
  }
}
