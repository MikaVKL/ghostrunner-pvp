/**
 * A "connection" between two ends inside the same program: what one end sends, the
 * other receives immediately. No network, no delay.
 *
 * The solo mode uses it to connect the normal GameClient to a GameServer that runs in
 * the same browser tab (see soloMatch.ts).
 */
import type { Transport } from '../shared/protocol/transport';

function createEnd(): Transport {
  return { send: () => {}, close: () => {}, onMessage: () => {}, onClose: () => {} };
}

/** Give `client` to a GameClient and `server` to GameServer.attach. */
export function createLoopback(): { client: Transport; server: Transport } {
  const client = createEnd();
  const server = createEnd();
  let open = true;
  client.send = (data) => {
    if (open) server.onMessage(data);
  };
  server.send = (data) => {
    if (open) client.onMessage(data);
  };
  const close = () => {
    if (!open) return;
    open = false;
    client.onClose();
    server.onClose();
  };
  client.close = close;
  server.close = close;
  return { client, server };
}
