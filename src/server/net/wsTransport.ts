/**
 * Adapts a `ws` WebSocket (Node server side) to the Transport interface.
 */
import type { WebSocket } from 'ws';
import type { Transport } from '../../shared/protocol/transport';

export function wrapServerSocket(socket: WebSocket): Transport {
  const transport: Transport = {
    send: (data) => {
      if (socket.readyState === socket.OPEN) socket.send(data);
    },
    close: () => socket.close(),
    onMessage: () => {},
    onClose: () => {},
  };
  socket.on('message', (data, isBinary) => {
    if (!isBinary) transport.onMessage(data.toString());
  });
  socket.on('close', () => transport.onClose());
  socket.on('error', () => socket.close());
  return transport;
}
