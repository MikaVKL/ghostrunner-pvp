/**
 * Wraps a Transport and delays every message in both directions (real time).
 * Lets you feel a bad connection on localhost: open the game with `?lag=150`.
 * `latencyMs` is the one-way delay, so the ping grows by twice that value.
 */
import type { Transport } from '../shared/protocol/transport';

export function withLag(inner: Transport, latencyMs: number, jitterMs = 0): Transport {
  if (latencyMs <= 0 && jitterMs <= 0) return inner;

  // Messages must stay in order (like TCP), so a later message never overtakes an earlier one.
  let lastSendAt = 0;
  let lastReceiveAt = 0;
  const delayed = (previous: number): number => {
    const at = performance.now() + latencyMs + Math.random() * jitterMs;
    return Math.max(previous, at);
  };

  const outer: Transport = {
    send: (data) => {
      lastSendAt = delayed(lastSendAt);
      setTimeout(() => inner.send(data), lastSendAt - performance.now());
    },
    close: () => inner.close(),
    onMessage: () => {},
    onClose: () => {},
  };
  inner.onMessage = (data) => {
    lastReceiveAt = delayed(lastReceiveAt);
    setTimeout(() => outer.onMessage(data), lastReceiveAt - performance.now());
  };
  inner.onClose = () => outer.onClose();
  return outer;
}
