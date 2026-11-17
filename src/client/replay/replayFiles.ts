/**
 * Saving a replay as a file (download) and reading one the player picked.
 * A replay file is plain text (JSON, see shared/replay/replayFormat.ts).
 */
import { getMap, isMapId } from '../../shared/maps';
import { serializeReplay, type ReplayFile } from '../../shared/replay/replayFormat';

/** File name like "neonklinge-reaktor-2026-11-17-1405.json". */
export function replayFileName(file: ReplayFile, now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `neonklinge-${file.mapId}-${stamp}.json`;
}

/** Let the browser download the replay as a file. */
export function downloadReplay(file: ReplayFile): void {
  const blob = new Blob([serializeReplay(file)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = replayFileName(file);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Read a file the player picked with an <input type="file">. */
export function readTextFile(file: File): Promise<string> {
  return file.text();
}

/** German title for a replay, e.g. "Mika gegen Bot Schwer · Reaktor". */
export function replayTitle(file: ReplayFile): string {
  const names = file.players.map((p) => p.name).join(' gegen ');
  return `${names} · ${isMapId(file.mapId) ? getMap(file.mapId).name : file.mapId}`;
}
