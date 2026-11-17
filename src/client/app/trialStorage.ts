/**
 * The best time trial run per map, kept in the browser (localStorage), so the ghost is
 * still there tomorrow. Storage can be missing or full (private window) - then the
 * best time simply lives only as long as the page.
 */
import { parseGhost, type GhostRun } from '../../solo/timeTrial';

const key = (mapId: string) => `timetrial:${mapId}`;

export function loadBestRun(mapId: string): GhostRun | null {
  try {
    return parseGhost(JSON.parse(localStorage.getItem(key(mapId)) ?? 'null'));
  } catch {
    return null;
  }
}

export function saveBestRun(mapId: string, run: GhostRun): void {
  try {
    localStorage.setItem(key(mapId), JSON.stringify(run));
  } catch {
    // Storage full or blocked: keep the record for this session only.
  }
}

/** "12.34 s" */
export function formatTicks(ticks: number): string {
  return `${(ticks / 60).toFixed(2)} s`;
}
