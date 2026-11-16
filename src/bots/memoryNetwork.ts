/**
 * A fake network that lives entirely in memory and runs on VIRTUAL time.
 *
 * Tests use it to connect bots to the server without real sockets or real waiting:
 * a 3 minute match with 100 ms lag simulates in well under a second, and with the same
 * seed it plays out exactly the same way every time (reproducible failures).
 */
import { createRng } from '../shared/math/rng';
import type { Transport } from '../shared/protocol/transport';

export interface NetworkConditions {
  /** One-way delay of every message in milliseconds. */
  latencyMs: number;
  /** Random extra delay per message, 0..jitterMs. */
  jitterMs: number;
  seed: number;
}

interface Delivery {
  at: number;
  order: number;
  run: () => void;
}

export class MemoryNetwork {
  /** Current virtual time in milliseconds. */
  nowMs = 0;
  private readonly rng;
  private queue: Delivery[] = [];
  private order = 0;

  constructor(private readonly conditions: NetworkConditions) {
    this.rng = createRng(conditions.seed);
  }

  /** Create a connection. Give `client` to a GameClient and `server` to GameServer.attach. */
  createLink(): { client: Transport; server: Transport } {
    const client = this.createEnd();
    const server = this.createEnd();
    this.connect(client, server);
    this.connect(server, client);
    return { client, server };
  }

  /** Simulate a broken connection: both ends are told that it closed (after the usual delay). */
  breakLink(link: { client: Transport; server: Transport }): void {
    link.client.close();
    link.server.close();
  }

  /** Deliver every message that is due up to `timeMs` and move the clock there. */
  advanceTo(timeMs: number): void {
    for (;;) {
      const next = this.popDue(timeMs);
      if (!next) break;
      this.nowMs = Math.max(this.nowMs, next.at);
      next.run();
    }
    this.nowMs = Math.max(this.nowMs, timeMs);
  }

  private createEnd(): Transport {
    return { send: () => {}, close: () => {}, onMessage: () => {}, onClose: () => {} };
  }

  /** Make `from.send` arrive at `to.onMessage` after the configured delay, in order. */
  private connect(from: Transport, to: Transport): void {
    let lastArrival = 0;
    let open = true;
    from.send = (data) => {
      if (!open) return;
      const delay = this.conditions.latencyMs + this.rng() * this.conditions.jitterMs;
      lastArrival = Math.max(lastArrival, this.nowMs + delay);
      this.queue.push({ at: lastArrival, order: this.order++, run: () => to.onMessage(data) });
    };
    from.close = () => {
      if (!open) return;
      open = false;
      this.queue.push({ at: this.nowMs, order: this.order++, run: () => to.onClose() });
    };
  }

  private popDue(timeMs: number): Delivery | null {
    let best = -1;
    for (let i = 0; i < this.queue.length; i++) {
      const d = this.queue[i];
      if (d.at > timeMs) continue;
      if (best < 0 || d.at < this.queue[best].at || (d.at === this.queue[best].at && d.order < this.queue[best].order)) {
        best = i;
      }
    }
    return best < 0 ? null : this.queue.splice(best, 1)[0];
  }
}
