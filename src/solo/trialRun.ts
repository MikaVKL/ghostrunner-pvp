/**
 * A time trial session: the real server core in this program with ONE player and no
 * opponent. With only one player the match stays in practice mode ('waiting'): free
 * running, and falling puts you back to your spawn. The TimeTrial watches the clock.
 * Like SoloMatch, it has no timer: call `step()` after every `client.tick()`.
 */
import { GameClient } from '../netcode/gameClient';
import { GameServer } from '../server/gameServer';
import { getMap } from '../shared/maps';
import { DEFAULT_MATCH_CONFIG } from '../shared/match/matchConfig';
import { createLoopback } from './loopback';
import { TimeTrial } from './timeTrial';

export class TrialRun {
  readonly client: GameClient;
  readonly server = new GameServer({ matchConfig: DEFAULT_MATCH_CONFIG });
  trial: TimeTrial;

  constructor(
    private readonly playerName: string,
    readonly mapId: string,
    predict = true,
  ) {
    const link = createLoopback();
    this.server.attach(link.server);
    this.client = new GameClient(link.client, { predict });
    const map = getMap(mapId);
    this.trial = new TimeTrial(map.spawns[0].pos, map.spawns[1].pos);
  }

  /** Create the room (set the client's callbacks first - the loopback answers at once). */
  start(): void {
    this.client.createRoom(this.playerName, this.mapId);
  }

  /** One tick of the local server, then the clock. Returns what the clock reported. */
  step(): ReturnType<TimeTrial['update']> {
    this.server.tick();
    const me = this.client.localPlayer;
    return me ? this.trial.update(me) : null;
  }

  /** Start over at the spawn: a fresh session (keeps the map and the name). */
  restart(): TrialRun {
    this.dispose();
    return new TrialRun(this.playerName, this.mapId);
  }

  dispose(): void {
    this.client.leaveRoom();
    this.client.close();
  }
}
